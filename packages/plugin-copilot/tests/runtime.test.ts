import { describe, expect, it, vi } from "vitest";
import { defineCopilot } from "../src/define-copilot.js";
import { CopilotRuntime } from "../src/internal/runtime.js";
import type { CopilotAgentLike, CopilotFrame, CopilotRealtimeProvider } from "../src/types.js";

const schema = { safeParse: (v: unknown) => ({ success: true as const, data: v }) };

interface InMemoryProvider extends CopilotRealtimeProvider {
  emit(roomId: string, frame: CopilotFrame): void;
  joins: Array<{ roomId: string; connectionId: string; presence?: Record<string, unknown> }>;
  presenceUpdates: Array<{ roomId: string; connectionId: string; patch: Record<string, unknown> }>;
  broadcasts: Array<{ roomId: string; connectionId: string; event: string; payload: Record<string, unknown> }>;
}

function makeMemoryProvider(): InMemoryProvider {
  const subs = new Map<string, Set<(f: CopilotFrame) => void>>();
  const presences = new Map<string, Map<string, Record<string, unknown>>>();
  const provider: InMemoryProvider = {
    joins: [],
    presenceUpdates: [],
    broadcasts: [],
    async joinRoom(roomId, conn, initialPresence) {
      provider.joins.push({ roomId, connectionId: conn.connectionId, presence: initialPresence });
      const room = presences.get(roomId) ?? new Map();
      room.set(conn.connectionId, initialPresence ?? {});
      presences.set(roomId, room);
    },
    async leaveRoom(roomId, connectionId) {
      presences.get(roomId)?.delete(connectionId);
    },
    async broadcast(roomId, connectionId, event, payload) {
      provider.broadcasts.push({ roomId, connectionId, event, payload });
      provider.emit(roomId, { type: "broadcast", connectionId, event, payload });
    },
    async updatePresence(roomId, connectionId, patch) {
      provider.presenceUpdates.push({ roomId, connectionId, patch });
      const room = presences.get(roomId);
      const cur = room?.get(connectionId) ?? {};
      room?.set(connectionId, { ...cur, ...patch });
      provider.emit(roomId, { type: "presence-changed", connectionId, presence: { ...cur, ...patch } });
    },
    async getPresence(roomId) {
      const room = presences.get(roomId);
      if (room === undefined) return {};
      const out: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of room) out[k] = v;
      return out;
    },
    subscribeRoom(roomId, listener) {
      const set = subs.get(roomId) ?? new Set();
      set.add(listener);
      subs.set(roomId, set);
      return () => set.delete(listener);
    },
    emit(roomId, frame) {
      const set = subs.get(roomId);
      if (set === undefined) return;
      for (const cb of set) cb(frame);
    },
  };
  return provider;
}

function makeAgent(responseText = "ack"): CopilotAgentLike {
  return {
    async *streamObject<T>() {
      yield { type: "partial", partial: { text: responseText } as unknown as T, attempt: 0 };
      yield { type: "complete", object: { text: responseText } as unknown as T };
    },
  };
}

const baseCopilot = defineCopilot({
  id: "c1",
  room: { id: "room-1", presence: schema, broadcast: schema },
  agent: { name: "GPT", model: "openrouter/openai/gpt-4o-mini" },
  identity: { name: "AI" },
  triggers: [{ on: "broadcast:question", action: "respond" }],
});

describe("CopilotRuntime", () => {
  it("registers + lists copilots", () => {
    const rt = new CopilotRuntime({ provider: makeMemoryProvider(), agent: makeAgent() });
    rt.registerCopilot(baseCopilot);
    expect(rt.listCopilotIds()).toContain("c1");
    expect(rt.getCopilot("c1")?.id).toBe("c1");
  });

  it("activate joins room with copilot connectionId", async () => {
    const provider = makeMemoryProvider();
    const rt = new CopilotRuntime({ provider, agent: makeAgent(), copilots: [baseCopilot] });
    await rt.activate("c1");
    expect(provider.joins).toHaveLength(1);
    expect(provider.joins[0]?.connectionId).toBe("copilot:c1");
  });

  it("user broadcast triggers copilot response (full Agent loop)", async () => {
    const provider = makeMemoryProvider();
    const onResponse = vi.fn();
    const rt = new CopilotRuntime({
      provider,
      agent: makeAgent("Hello world"),
      copilots: [baseCopilot],
      onResponse,
    });
    await rt.activate("c1");

    // Simulate a real user broadcasting a question (NOT via provider.broadcast since
    // that would also bounce back to our runtime — emit directly into the room).
    provider.emit("room-1", {
      type: "broadcast",
      connectionId: "user-1",
      event: "question",
      payload: { text: "Hi?" },
    });

    // Wait for async runAgent.
    await new Promise((r) => setTimeout(r, 30));

    expect(onResponse).toHaveBeenCalledWith("c1", "room-1", "Hello world");
    const msgBroadcast = provider.broadcasts.find(
      (b) => b.event === "message" && b.connectionId === "copilot:c1",
    );
    expect(msgBroadcast?.payload.text).toBe("Hello world");
  });

  it("ignores copilot-originated broadcasts (EC-4 / EC-8 cost-runaway guard)", async () => {
    const provider = makeMemoryProvider();
    const onResponse = vi.fn();
    const rt = new CopilotRuntime({
      provider,
      agent: makeAgent("loop"),
      copilots: [baseCopilot],
      onResponse,
    });
    await rt.activate("c1");

    // Frame from another copilot — should be ignored.
    provider.emit("room-1", {
      type: "broadcast",
      connectionId: "copilot:other",
      event: "question",
      payload: { text: "infinite loop?" },
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(onResponse).not.toHaveBeenCalled();
  });

  it("typing indicator fires before + after response", async () => {
    const provider = makeMemoryProvider();
    const rt = new CopilotRuntime({
      provider,
      agent: makeAgent("done"),
      copilots: [baseCopilot],
    });
    await rt.activate("c1");

    provider.emit("room-1", {
      type: "broadcast",
      connectionId: "user-1",
      event: "question",
      payload: { text: "go" },
    });
    await new Promise((r) => setTimeout(r, 30));

    const typingTrue = provider.presenceUpdates.find(
      (p) => p.connectionId === "copilot:c1" && p.patch.typing === true,
    );
    const typingFalse = provider.presenceUpdates.find(
      (p) => p.connectionId === "copilot:c1" && p.patch.typing === false,
    );
    expect(typingTrue).toBeDefined();
    expect(typingFalse).toBeDefined();
  });

  it("budget exceeded broadcasts typed error frame instead of running agent", async () => {
    const provider = makeMemoryProvider();
    const onResponse = vi.fn();
    const copilotWithBudget = defineCopilot({
      ...baseCopilot,
      id: "c2",
      budget: { perRoom: { perRequestUsd: 0.001 } }, // estimate = 0.01 > 0.001
    });
    const rt = new CopilotRuntime({
      provider,
      agent: makeAgent(),
      copilots: [copilotWithBudget],
      onResponse,
      estimatedCostPerInvocationUsd: 0.01,
    });
    await rt.activate("c2");

    provider.emit("room-1", {
      type: "broadcast",
      connectionId: "user-1",
      event: "question",
      payload: { text: "?" },
    });
    await new Promise((r) => setTimeout(r, 30));

    expect(onResponse).not.toHaveBeenCalled();
    const errBroadcast = provider.broadcasts.find((b) => b.event === "budget-exceeded");
    expect(errBroadcast).toBeDefined();
    expect(errBroadcast?.payload.code).toBe("budget_per_request_exceeded");
  });

  it("dispatcher 'all' invokes every copilot in room", async () => {
    const provider = makeMemoryProvider();
    const onResponse = vi.fn();
    const c1 = defineCopilot({ ...baseCopilot, id: "alpha", dispatcher: "all" });
    const c2 = defineCopilot({ ...baseCopilot, id: "beta", dispatcher: "all" });
    const rt = new CopilotRuntime({ provider, agent: makeAgent("ok"), copilots: [c1, c2], onResponse });
    await rt.activate("alpha");
    await rt.activate("beta");

    provider.emit("room-1", {
      type: "broadcast",
      connectionId: "user-1",
      event: "question",
      payload: { text: "hi" },
    });
    await new Promise((r) => setTimeout(r, 50));

    const responders = onResponse.mock.calls.map((c) => c[0]);
    expect(responders).toContain("alpha");
    expect(responders).toContain("beta");
  });

  it("dispatcher 'first-wins' default: only first registered responds", async () => {
    const provider = makeMemoryProvider();
    const onResponse = vi.fn();
    const c1 = defineCopilot({ ...baseCopilot, id: "alpha" });
    const c2 = defineCopilot({ ...baseCopilot, id: "beta" });
    const rt = new CopilotRuntime({ provider, agent: makeAgent("ok"), copilots: [c1, c2], onResponse });
    await rt.activate("alpha");
    await rt.activate("beta");

    provider.emit("room-1", {
      type: "broadcast",
      connectionId: "user-1",
      event: "question",
      payload: { text: "hi" },
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse.mock.calls[0]?.[0]).toBe("alpha");
  });

  it("unregister leaves room + clears tracking", async () => {
    const provider = makeMemoryProvider();
    const rt = new CopilotRuntime({ provider, agent: makeAgent(), copilots: [baseCopilot] });
    await rt.activate("c1");
    const removed = await rt.unregisterCopilot("c1");
    expect(removed).toBe(true);
    expect(rt.listCopilotIds()).not.toContain("c1");
  });

  it("getUsage returns 0 when no charges yet", async () => {
    const provider = makeMemoryProvider();
    const cop = defineCopilot({ ...baseCopilot, budget: { perRoom: { dailyUsd: 10 } } });
    const rt = new CopilotRuntime({ provider, agent: makeAgent(), copilots: [cop] });
    expect(rt.getUsage("c1")).toEqual({ dailyUsedUsd: 0, monthlyUsedUsd: 0 });
  });

  it("throws on unknown copilot activate", async () => {
    const rt = new CopilotRuntime({ provider: makeMemoryProvider(), agent: makeAgent() });
    await expect(rt.activate("nope")).rejects.toThrow(/Unknown copilot/);
  });
});
