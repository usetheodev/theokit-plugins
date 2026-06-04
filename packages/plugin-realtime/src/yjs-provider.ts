/**
 * @theokit/plugin-realtime — YjsRealtimeProvider (P#9 opt-in CRDT).
 *
 * Per ADR D1 (Form 4 Hybrid Yjs opt-in) + D2 (Yjs optional peer via dynamic
 * import) + D7 (Awareness-backed wire format; in-process LWW read path).
 *
 * Requires `yjs ^13` + `y-protocols ^1` optional peers. Dynamic
 * `import('yjs')` + `import('y-protocols/awareness')` on first use; throws
 * actionable {@link RealtimeError} on missing peer.
 *
 * Read/write semantics (in-process):
 * - `getPresence` / `updatePresence` use a per-room `Map<connectionId, Presence>`
 *   identical to MemoryRealtimeProvider — predictable LWW semantics.
 * - Y.Doc + Awareness are maintained per-room and exposed via `applyYjsUpdate`
 *   / `applyYjsAwareness` for the binary CRDT wire path. Awareness convergence
 *   happens when consumers ship binary updates between processes (the
 *   in-process tests exercise the LWW read path; multi-process Awareness
 *   convergence is exercised via the binary apply* methods).
 *
 * @public
 */

import {
  type BroadcastPayload,
  type ConnectionInfo,
  type Presence,
  RealtimeError,
  type RealtimeFrame,
  type RealtimeProvider,
  type RealtimeUnsubscribe,
} from "./types.js";

// Structural types for yjs + y-protocols (peers may be absent).
interface YDocLike {
  readonly clientID: number;
  destroy(): void;
}

interface YDocConstructor {
  new (opts?: { gc?: boolean }): YDocLike;
}

interface AwarenessLike {
  readonly doc: YDocLike;
  readonly clientID: number;
  readonly states: Map<number, Record<string, unknown>>;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalState(state: Record<string, unknown> | null): void;
  destroy(): void;
}

interface AwarenessConstructor {
  new (doc: YDocLike): AwarenessLike;
}

interface YjsModule {
  readonly Doc: YDocConstructor;
  applyUpdate(doc: YDocLike, update: Uint8Array, origin?: unknown): void;
}

interface YAwarenessModule {
  readonly Awareness: AwarenessConstructor;
  applyAwarenessUpdate(awareness: AwarenessLike, update: Uint8Array, origin?: unknown): void;
}

let cachedYjs: YjsModule | null = null;
let cachedAwareness: YAwarenessModule | null = null;

async function loadYjs(): Promise<{ yjs: YjsModule; awareness: YAwarenessModule }> {
  if (cachedYjs !== null && cachedAwareness !== null) {
    return { yjs: cachedYjs, awareness: cachedAwareness };
  }
  let yjsModule: YjsModule;
  let awarenessModule: YAwarenessModule;
  try {
    yjsModule = (await import("yjs")) as unknown as YjsModule;
  } catch (cause) {
    throw new RealtimeError(
      "`yjs` peer dependency not installed. Run `pnpm add yjs y-protocols` to use YjsRealtimeProvider.",
      { code: "yjs_peer_missing", cause },
    );
  }
  try {
    awarenessModule = (await import("y-protocols/awareness.js")) as unknown as YAwarenessModule;
  } catch (cause) {
    throw new RealtimeError(
      "`y-protocols/awareness` peer dependency not installed. Run `pnpm add y-protocols` to use YjsRealtimeProvider.",
      { code: "y_protocols_peer_missing", cause },
    );
  }
  cachedYjs = yjsModule;
  cachedAwareness = awarenessModule;
  return { yjs: yjsModule, awareness: awarenessModule };
}

interface YjsRoomState {
  /** Per-connection presence (LWW; identical to MemoryProvider semantics). */
  readonly presences: Map<string, Presence>;
  /** Active room listeners. */
  readonly listeners: Set<(frame: RealtimeFrame) => void>;
  /** Lazily-initialized Y.Doc (created on first applyYjsUpdate / awareness call). */
  doc: YDocLike | null;
  /** Lazily-initialized Awareness (same trigger). */
  awareness: AwarenessLike | null;
}

/**
 * Options accepted by {@link createYjsRealtimeProvider}.
 *
 * @public
 */
export interface YjsRealtimeProviderOptions {
  /**
   * Maximum Y.Doc update size in bytes (DoS mitigation per blueprint EC-7).
   * Default 1 MB.
   */
  maxUpdateBytes?: number;
}

const DEFAULT_MAX_UPDATE_BYTES = 1_048_576;

/**
 * Create a Yjs CRDT-backed realtime provider.
 *
 * In-process presence read/write semantics match MemoryRealtimeProvider
 * (per-room Map LWW). Y.Doc + Awareness are exposed via `applyYjsUpdate` /
 * `applyYjsAwareness` for the binary CRDT wire path used across processes.
 *
 * @public
 */
export function createYjsRealtimeProvider(
  opts: YjsRealtimeProviderOptions = {},
): RealtimeProvider {
  const maxUpdateBytes = opts.maxUpdateBytes ?? DEFAULT_MAX_UPDATE_BYTES;
  const rooms = new Map<string, YjsRoomState>();

  const ensureRoom = (roomId: string): YjsRoomState => {
    let state = rooms.get(roomId);
    if (state === undefined) {
      state = { presences: new Map(), listeners: new Set(), doc: null, awareness: null };
      rooms.set(roomId, state);
    }
    return state;
  };

  const ensureYjs = async (state: YjsRoomState): Promise<{ doc: YDocLike; awareness: AwarenessLike }> => {
    if (state.doc !== null && state.awareness !== null) {
      return { doc: state.doc, awareness: state.awareness };
    }
    const { yjs, awareness: aw } = await loadYjs();
    state.doc = new yjs.Doc({ gc: true });
    state.awareness = new aw.Awareness(state.doc);
    return { doc: state.doc, awareness: state.awareness };
  };

  const fanout = (state: YjsRoomState, frame: RealtimeFrame): void => {
    for (const listener of state.listeners) {
      try {
        listener(frame);
      } catch {
        // Listener errors must not break broadcast loop.
      }
    }
  };

  const gcIfEmpty = (roomId: string, state: YjsRoomState): void => {
    if (state.presences.size === 0 && state.listeners.size === 0) {
      if (state.awareness !== null) state.awareness.destroy();
      if (state.doc !== null) state.doc.destroy();
      rooms.delete(roomId);
    }
  };

  return {
    name: "yjs",

    async joinRoom(roomId, connection, initialPresence): Promise<void> {
      const state = ensureRoom(roomId);
      const presence: Presence = initialPresence ?? {};
      state.presences.set(connection.connectionId, presence);
      fanout(state, {
        type: "joined",
        connectionId: connection.connectionId,
        presence,
      });
    },

    async leaveRoom(roomId, connectionId): Promise<void> {
      const state = rooms.get(roomId);
      if (state === undefined) return;
      const had = state.presences.delete(connectionId);
      if (!had) return;
      fanout(state, { type: "left", connectionId });
      gcIfEmpty(roomId, state);
    },

    async broadcast(roomId, connectionId, event, payload): Promise<void> {
      const state = rooms.get(roomId);
      if (state === undefined) return;
      fanout(state, {
        type: "broadcast",
        connectionId,
        event,
        payload,
      });
    },

    async updatePresence(roomId, connectionId, patch): Promise<void> {
      const state = rooms.get(roomId);
      if (state === undefined) return;
      const current = state.presences.get(connectionId);
      if (current === undefined) return;
      const next = { ...current, ...patch } as Presence;
      state.presences.set(connectionId, next);
      fanout(state, {
        type: "presence-changed",
        connectionId,
        presence: next,
      });
    },

    async getPresence(roomId): Promise<Record<string, Presence>> {
      const state = rooms.get(roomId);
      if (state === undefined) return {};
      const snapshot: Record<string, Presence> = {};
      for (const [connId, p] of state.presences) {
        snapshot[connId] = { ...p };
      }
      return snapshot;
    },

    subscribeRoom(roomId, listener): RealtimeUnsubscribe {
      const state = ensureRoom(roomId);
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
        gcIfEmpty(roomId, state);
      };
    },

    async applyYjsUpdate(roomId, connectionId, bytes): Promise<void> {
      if (bytes.byteLength > maxUpdateBytes) {
        throw new RealtimeError(
          `Y.Doc update size ${bytes.byteLength}B exceeds maxUpdateBytes ${maxUpdateBytes}B`,
          { code: "yjs_update_oversized" },
        );
      }
      const state = rooms.get(roomId);
      if (state === undefined) return;
      const { doc } = await ensureYjs(state);
      const { yjs } = await loadYjs();
      yjs.applyUpdate(doc, bytes, connectionId);
    },

    async applyYjsAwareness(roomId, connectionId, bytes): Promise<void> {
      if (bytes.byteLength > maxUpdateBytes) {
        throw new RealtimeError(
          `Y.Awareness update size ${bytes.byteLength}B exceeds maxUpdateBytes ${maxUpdateBytes}B`,
          { code: "y_awareness_oversized" },
        );
      }
      const state = rooms.get(roomId);
      if (state === undefined) return;
      const { awareness } = await ensureYjs(state);
      const { awareness: awMod } = await loadYjs();
      awMod.applyAwarenessUpdate(awareness, bytes, connectionId);
    },
  };
}

/** Re-export for callers wanting structural types inline. */
export type { ConnectionInfo, BroadcastPayload };
