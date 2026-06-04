import { describe, expect, it } from "vitest";
import { createMemoryRealtimeProvider } from "../src/memory-provider.js";
import type { RealtimeFrame } from "../src/types.js";

describe("MemoryRealtimeProvider", () => {
  it("joinRoom + getPresence returns initial state", async () => {
    const p = createMemoryRealtimeProvider();
    await p.joinRoom("room1", { connectionId: "c1" }, { cursor: [10, 20] });
    const snap = await p.getPresence("room1");
    expect(snap).toEqual({ c1: { cursor: [10, 20] } });
  });

  it("updatePresence merges patch", async () => {
    const p = createMemoryRealtimeProvider();
    await p.joinRoom("room", { connectionId: "c1" }, { a: 1 });
    await p.updatePresence("room", "c1", { b: 2 });
    expect(await p.getPresence("room")).toEqual({ c1: { a: 1, b: 2 } });
  });

  it("subscribeRoom fires joined/presence-changed/left in order", async () => {
    const p = createMemoryRealtimeProvider();
    const frames: RealtimeFrame[] = [];
    const unsub = p.subscribeRoom("room", (f) => frames.push(f));
    await p.joinRoom("room", { connectionId: "alice" }, { name: "Alice" });
    await p.updatePresence("room", "alice", { name: "Alice", cursor: [1, 2] });
    await p.leaveRoom("room", "alice");
    unsub();
    expect(frames.map((f) => f.type)).toEqual(["joined", "presence-changed", "left"]);
    expect((frames[0] as { connectionId: string }).connectionId).toBe("alice");
  });

  it("broadcast fans out to room listeners", async () => {
    const p = createMemoryRealtimeProvider();
    const frames: RealtimeFrame[] = [];
    p.subscribeRoom("room", (f) => frames.push(f));
    await p.joinRoom("room", { connectionId: "c1" });
    await p.broadcast("room", "c1", "ping", { ts: 12345 });
    const broadcast = frames.find((f) => f.type === "broadcast");
    expect(broadcast).toBeDefined();
    expect((broadcast as unknown as { event: string; payload: { ts: number } }).event).toBe("ping");
    expect((broadcast as unknown as { payload: { ts: number } }).payload).toEqual({ ts: 12345 });
  });

  it("multi-room isolation: presence in room A invisible in room B", async () => {
    const p = createMemoryRealtimeProvider();
    await p.joinRoom("A", { connectionId: "c1" }, { v: 1 });
    await p.joinRoom("B", { connectionId: "c2" }, { v: 2 });
    expect(await p.getPresence("A")).toEqual({ c1: { v: 1 } });
    expect(await p.getPresence("B")).toEqual({ c2: { v: 2 } });
  });

  it("unsubscribe stops fanout to listener", async () => {
    const p = createMemoryRealtimeProvider();
    const frames: RealtimeFrame[] = [];
    const unsub = p.subscribeRoom("room", (f) => frames.push(f));
    await p.joinRoom("room", { connectionId: "c1" });
    unsub();
    await p.updatePresence("room", "c1", { x: 1 });
    expect(frames.map((f) => f.type)).toEqual(["joined"]);
  });

  it("leaveRoom on unknown connection is a no-op", async () => {
    const p = createMemoryRealtimeProvider();
    await p.joinRoom("room", { connectionId: "c1" });
    await expect(p.leaveRoom("room", "unknown")).resolves.toBeUndefined();
    expect(await p.getPresence("room")).toEqual({ c1: {} });
  });
});
