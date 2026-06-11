/**
 * @theokit/plugin-copilot — CopilotRuntime (P#11 internal orchestrator).
 *
 * Per ADR D1 (Form 4 Hybrid) + D2 (RoomMember pattern) + D3 (triggers) +
 * D4 (Agent.streamObject canonical) + D6 (dispatcher policy) + D7 (Budget).
 *
 * Registers copilots. Listens to room frames via P#9 subscribeRoom.
 * Evaluates triggers. Invokes Agent.streamObject. Broadcasts responses
 * with typing-indicator presence updates.
 *
 * @internal
 */

import { AgentRoomMember } from "../agent-room-member.js";
import {
  type CopilotAgentLike,
  type CopilotDescriptor,
  type CopilotDispatcher,
  type CopilotFrame,
  type CopilotRealtimeProvider,
  CopilotTriggerError,
} from "../types.js";
import { BudgetBridge } from "./budget-bridge.js";
import { ensureCanvasPeer } from "./canvas-bridge.js";
import { TriggerEvaluator } from "./trigger-evaluator.js";
import { ensureVoicePeer } from "./voice-bridge.js";

/**
 * Options accepted by {@link CopilotRuntime}.
 *
 * @public
 */
export interface CopilotRuntimeOptions {
  /** P#9 RealtimeProvider (Memory default OR Yjs opt-in OR custom). */
  provider: CopilotRealtimeProvider;
  /** Agent runtime (Agent.streamObject) — structural mirror per ADR D4. */
  agent: CopilotAgentLike;
  /** Copilots to register at construction. */
  copilots?: ReadonlyArray<CopilotDescriptor>;
  /** Default dispatcher policy when copilot doesn't specify one (per ADR D6). */
  defaultDispatcher?: CopilotDispatcher;
  /** Hook called when copilot responds — useful for telemetry / tests. */
  onResponse?: (copilotId: string, roomId: string, text: string) => void;
  /**
   * Estimated cost per agent invocation (USD). Used for Budget preflight
   * when copilot config doesn't specify perRequestUsd. Default 0.01 USD.
   */
  estimatedCostPerInvocationUsd?: number;
}

interface CopilotRegistration {
  readonly descriptor: CopilotDescriptor;
  readonly member: AgentRoomMember;
  readonly budget: BudgetBridge;
  unsubscribeRoom?: () => void;
  unscheduleIdle?: () => void;
}

/**
 * Orchestrates copilot lifecycle + trigger dispatch + Agent invocation.
 *
 * @public
 */
export class CopilotRuntime {
  private readonly registry = new Map<string, CopilotRegistration>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly evaluator = new TriggerEvaluator();
  private readonly roundRobinCursor = new Map<string, number>();
  private readonly provider: CopilotRealtimeProvider;
  private readonly agent: CopilotAgentLike;
  private readonly defaultDispatcher: CopilotDispatcher;
  private readonly onResponse: CopilotRuntimeOptions["onResponse"];
  private readonly estimatedCostPerInvocationUsd: number;

  constructor(opts: CopilotRuntimeOptions) {
    if (opts === null || typeof opts !== "object") {
      throw new TypeError("CopilotRuntime: options object is required");
    }
    if (opts.provider === undefined) {
      throw new TypeError("CopilotRuntime: opts.provider is required");
    }
    if (opts.agent === undefined) {
      throw new TypeError("CopilotRuntime: opts.agent is required");
    }
    this.provider = opts.provider;
    this.agent = opts.agent;
    this.defaultDispatcher = opts.defaultDispatcher ?? "first-wins";
    this.onResponse = opts.onResponse;
    this.estimatedCostPerInvocationUsd = opts.estimatedCostPerInvocationUsd ?? 0.01;
    for (const c of opts.copilots ?? []) {
      this.registerCopilot(c);
    }
  }

  /** Register a copilot. Idempotent for same id (replaces). */
  registerCopilot(descriptor: CopilotDescriptor): void {
    if (this.registry.has(descriptor.id)) {
      this.unregisterCopilot(descriptor.id);
    }
    const member = new AgentRoomMember(descriptor, this.provider);
    const budget = new BudgetBridge(descriptor.budget);
    this.registry.set(descriptor.id, { descriptor, member, budget });
  }

  /** Unregister a copilot (releases room membership + clears trigger state). */
  async unregisterCopilot(id: string): Promise<boolean> {
    const reg = this.registry.get(id);
    if (reg === undefined) return false;
    reg.unsubscribeRoom?.();
    reg.unscheduleIdle?.();
    await reg.member.leave();
    this.evaluator.clearRoom(reg.descriptor.room.id);
    this.registry.delete(id);
    return true;
  }

  /**
   * Activate a copilot — joins its room + subscribes to frames + schedules
   * idle triggers. Idempotent.
   */
  async activate(copilotId: string): Promise<void> {
    const reg = this.registry.get(copilotId);
    if (reg === undefined) throw new CopilotTriggerError(`Unknown copilot: ${copilotId}`);
    if (reg.unsubscribeRoom !== undefined) return; // already active

    // Runtime peer checks (opt-in voice/canvas)
    await ensureVoicePeer(reg.descriptor.voice);
    await ensureCanvasPeer(reg.descriptor.canvas);

    // Join room.
    await reg.member.join();

    // Subscribe to room frames.
    reg.unsubscribeRoom = this.provider.subscribeRoom(reg.descriptor.room.id, (frame) => {
      void this.handleFrame(reg, frame);
    });

    // Schedule idle triggers.
    const idleTrigger = reg.descriptor.triggers.find((t) => t.on === "presence:idle");
    if (idleTrigger !== undefined && idleTrigger.on === "presence:idle") {
      reg.unscheduleIdle = this.evaluator.scheduleIdleCheck(
        reg.descriptor.room.id,
        idleTrigger,
        () => {
          void this.runAgent(reg, { type: "presence-changed", connectionId: "__idle__", presence: {} }, "suggest");
        },
      );
    }
  }

  /** Deactivate a copilot — drains pending work, then leaves room but keeps registration. */
  async deactivate(copilotId: string): Promise<void> {
    const reg = this.registry.get(copilotId);
    if (reg === undefined) return;
    reg.unsubscribeRoom?.();
    reg.unsubscribeRoom = undefined as unknown as () => void;
    reg.unscheduleIdle?.();
    reg.unscheduleIdle = undefined as unknown as () => void;
    // Drain pending handleFrame work before teardown (EC-3).
    await this.queues.get(copilotId);
    this.queues.delete(copilotId);
    await reg.member.leave();
  }

  /** Get usage stats for a copilot (theo-ui usage-meter integration). */
  getUsage(copilotId: string): { dailyUsedUsd: number; monthlyUsedUsd: number } | undefined {
    const reg = this.registry.get(copilotId);
    if (reg === undefined) return undefined;
    return reg.budget.getUsage(copilotId, reg.descriptor.room.id);
  }

  /** List registered copilot ids. */
  listCopilotIds(): string[] {
    return [...this.registry.keys()];
  }

  /** Look up a copilot descriptor (read-only). */
  getCopilot(id: string): CopilotDescriptor | undefined {
    return this.registry.get(id)?.descriptor;
  }

  private async handleFrame(reg: CopilotRegistration, frame: CopilotFrame): Promise<void> {
    const id = reg.descriptor.id;
    const prev = this.queues.get(id) ?? Promise.resolve();
    const next = prev.then(() => this._handleFrame(reg, frame)).catch(() => {});
    this.queues.set(id, next);
    return next;
  }

  private async _handleFrame(reg: CopilotRegistration, frame: CopilotFrame): Promise<void> {
    const matches = this.evaluator.evaluate(
      reg.descriptor.triggers,
      frame,
      reg.descriptor.room.id,
    );
    if (matches.length === 0) return;

    // Dispatcher: choose which copilots respond (only relevant when multiple
    // copilots share the same room — single-copilot path always responds).
    const copilotsInRoom = this.copilotsInRoom(reg.descriptor.room.id);
    const dispatcher = reg.descriptor.dispatcher ?? this.defaultDispatcher;
    const chosen = this.applyDispatcher(dispatcher, copilotsInRoom, frame);
    if (!chosen.includes(reg.descriptor.id)) return;

    for (const match of matches) {
      await this.runAgent(reg, frame, match.trigger.action);
    }
  }

  private async runAgent(
    reg: CopilotRegistration,
    frame: CopilotFrame,
    action: "respond" | "suggest" | "execute-tool",
  ): Promise<void> {
    const promptText = framePrompt(frame, action, reg.descriptor.agent.systemPrompt);
    try {
      reg.budget.preflightCheck(reg.descriptor.id, reg.descriptor.room.id, this.estimatedCostPerInvocationUsd);
    } catch (err) {
      // Budget exceeded — broadcast typed error then bail out.
      await reg.member.broadcastEvent("budget-exceeded", {
        message: (err as Error).message,
        code: (err as { code?: string }).code ?? "budget_exceeded",
      });
      return;
    }

    await reg.member.setTyping(true);

    let finalText = "";
    try {
      // Resolve apiKey thunk (supports lazy / rotated keys).
      const resolvedApiKey =
        typeof reg.descriptor.agent.apiKey === "function"
          ? reg.descriptor.agent.apiKey()
          : reg.descriptor.agent.apiKey;

      // Minimal Zod-like passthrough schema (Agent.streamObject expects a schema).
      const passthrough = {
        safeParse: (v: unknown) => ({ success: true, data: v }),
        parse: (v: unknown) => v,
      };
      const iter = this.agent.streamObject<{ text: string }>({
        schema: passthrough,
        prompt: promptText,
        model: reg.descriptor.agent.model,
        ...(resolvedApiKey !== undefined ? { apiKey: resolvedApiKey } : {}),
        ...(reg.descriptor.agent.local !== undefined ? { local: reg.descriptor.agent.local } : {}),
        ...(reg.descriptor.agent.systemPrompt !== undefined
          ? { systemPrompt: reg.descriptor.agent.systemPrompt }
          : {}),
      });
      let chunkCount = 0;
      for await (const evt of iter) {
        if (evt.type === "partial") {
          chunkCount++;
          await reg.member.setTyping(true, Math.min(0.99, chunkCount * 0.1));
        } else if (evt.type === "complete") {
          finalText = String(evt.object?.text ?? evt.object ?? "");
        }
      }
      reg.budget.charge(reg.descriptor.id, reg.descriptor.room.id, this.estimatedCostPerInvocationUsd);
      if (finalText.length > 0) {
        await reg.member.broadcastMessage(finalText, { triggeredBy: action });
        this.onResponse?.(reg.descriptor.id, reg.descriptor.room.id, finalText);
      }
    } catch (cause) {
      await reg.member.broadcastEvent("agent-error", {
        message: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    } finally {
      await reg.member.setTyping(false);
    }
  }

  private copilotsInRoom(roomId: string): ReadonlyArray<{ id: string }> {
    const out: { id: string }[] = [];
    for (const reg of this.registry.values()) {
      if (reg.descriptor.room.id === roomId) out.push({ id: reg.descriptor.id });
    }
    return out;
  }

  private applyDispatcher(
    dispatcher: CopilotDispatcher,
    copilots: ReadonlyArray<{ id: string }>,
    frame: CopilotFrame,
  ): string[] {
    if (copilots.length === 0) return [];
    if (copilots.length === 1) return [copilots[0]!.id];
    if (typeof dispatcher === "function") {
      return [...dispatcher(copilots, frame)];
    }
    switch (dispatcher) {
      case "all":
        return copilots.map((c) => c.id);
      case "round-robin": {
        const roomId = (frame as { connectionId?: string }).connectionId ?? "global";
        const cursor = (this.roundRobinCursor.get(roomId) ?? 0) % copilots.length;
        this.roundRobinCursor.set(roomId, cursor + 1);
        return [copilots[cursor]!.id];
      }
      case "first-wins":
      default:
        return [copilots[0]!.id];
    }
  }
}

function framePrompt(frame: CopilotFrame, action: string, systemPrompt: string | undefined): string {
  if (frame.type === "broadcast" && typeof frame.payload?.text === "string") {
    return `${systemPrompt ?? ""}\n\nUser said: ${frame.payload.text}\n\nRespond.`.trim();
  }
  if (action === "suggest") {
    return `${systemPrompt ?? ""}\n\nUsers are idle. Proactively suggest something useful.`.trim();
  }
  return `${systemPrompt ?? ""}\n\nFrame: ${JSON.stringify(frame)}\n\nRespond.`.trim();
}
