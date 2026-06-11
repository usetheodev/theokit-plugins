import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineRoom } from "../src/define-room.js";
import { createMemoryRealtimeProvider } from "../src/memory-provider.js";
import {
  RealtimeAuthorizationError,
  RealtimePresenceError,
  RealtimeRoomNotFoundError,
} from "../src/types.js";
import { RealtimeRuntime } from "../src/internal/runtime.js";

const cursorRoom = defineRoom({
  id: "cursor",
  presence: z.object({ x: z.number(), y: z.number() }).partial(),
  broadcast: z.object({ kind: z.literal("ping"), ts: z.number() }),
});

describe("RealtimeRuntime", () => {
  it("registerRoom + getRoom", () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider, rooms: [cursorRoom] });
    expect(rt.getRoom("cursor")?.id).toBe("cursor");
  });

  it("handleConnection joins + fans frames", async () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider, rooms: [cursorRoom] });
    const frames: unknown[] = [];
    const handle = await rt.handleConnection(
      "cursor",
      { connectionId: "c1" },
      { x: 1, y: 2 },
      (f) => frames.push(f),
    );
    expect(frames).toHaveLength(1);
    expect((frames[0] as { type: string }).type).toBe("joined");
    await handle.release();
  });

  it("authorize rejection throws RealtimeAuthorizationError", async () => {
    const provider = createMemoryRealtimeProvider();
    const room = defineRoom({
      id: "private",
      presence: z.object({}),
      broadcast: z.object({}),
      authorize: () => false,
    });
    const rt = new RealtimeRuntime({ provider, rooms: [room] });
    await expect(
      rt.handleConnection("private", { connectionId: "c1" }, undefined, () => {}),
    ).rejects.toThrow(RealtimeAuthorizationError);
  });

  it("invalid initial presence throws RealtimePresenceError", async () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider, rooms: [cursorRoom] });
    await expect(
      rt.handleConnection(
        "cursor",
        { connectionId: "c1" },
        { x: "not a number" } as unknown as Record<string, number>,
        () => {},
      ),
    ).rejects.toThrow(RealtimePresenceError);
  });

  it("dispatchFrame presence-update validates + delegates", async () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider, rooms: [cursorRoom] });
    await rt.handleConnection("cursor", { connectionId: "c1" }, undefined, () => {});
    await rt.dispatchFrame("cursor", "c1", { kind: "presence-update", patch: { x: 5 } });
    const presence = await rt.getPresence("cursor");
    expect(presence.c1?.x).toBe(5);
  });

  it("dispatchFrame broadcast validates + delegates", async () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider, rooms: [cursorRoom] });
    const frames: unknown[] = [];
    await rt.handleConnection("cursor", { connectionId: "c1" }, undefined, (f) => frames.push(f));
    await rt.dispatchFrame("cursor", "c1", {
      kind: "broadcast",
      event: "ping",
      payload: { kind: "ping", ts: 999 },
    });
    const bc = frames.find((f) => (f as { type: string }).type === "broadcast");
    expect(bc).toBeDefined();
  });

  it("unknown room throws RealtimeRoomNotFoundError", async () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider });
    await expect(
      rt.handleConnection("nope", { connectionId: "c1" }, undefined, () => {}),
    ).rejects.toThrow(RealtimeRoomNotFoundError);
  });

  it("yjs-update on non-Yjs provider is a no-op", async () => {
    const provider = createMemoryRealtimeProvider();
    const rt = new RealtimeRuntime({ provider, rooms: [cursorRoom] });
    await rt.handleConnection("cursor", { connectionId: "c1" }, undefined, () => {});
    await expect(
      rt.dispatchFrame("cursor", "c1", { kind: "yjs-update", bytes: new Uint8Array(0) }),
    ).resolves.toBeUndefined();
  });
});
