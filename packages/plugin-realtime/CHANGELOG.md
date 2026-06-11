# @theokit/plugin-realtime

## [Unreleased]

## [0.1.0] - 2026-06-04 (initial; unpublished — gated on @theokit/sdk@1.7.0 @next)

Per plan [`p9-plugin-realtime-plan.md`](../../../.claude/knowledge-base/plans/p9-plugin-realtime-plan.md) v1.0 and blueprint [`p9-plugin-realtime-blueprint.md`](../../../.claude/knowledge-base/discoveries/blueprints/p9-plugin-realtime-blueprint.md) v1.0 (SHIPPABLE 99.2/100). Form 4 Hybrid: `RealtimeProvider` interface + `MemoryRealtimeProvider` default + `YjsRealtimeProvider` opt-in + `defineRealtimeProvider` extension. Consumes G8 `@theokit/sdk/subscription` for WS transport.

### Added

- **`RealtimeProvider`** interface — `{name, joinRoom, leaveRoom, broadcast, updatePresence, getPresence, subscribeRoom, applyYjsUpdate?, applyYjsAwareness?}` (D1).
- **`createMemoryRealtimeProvider()`** — zero-dep in-process default; per-room `Map<connectionId, Presence>` LWW; fanout via `subscribeRoom` listeners (D6).
- **`createYjsRealtimeProvider({maxUpdateBytes?})`** — Yjs CRDT-backed provider; dynamic `import('yjs')` + `import('y-protocols/awareness.js')` peers; lazy Y.Doc + Awareness per room; binary update size cap (default 1 MB) per blueprint EC-7 (D2).
- **`defineRealtimeProvider(impl)`** — type-asserting helper for consumer-supplied adapters (Liveblocks / PartyKit / Cloudflare DO / Redis).
- **`defineRoom({id, presence, broadcast, storage?, authorize?})`** — typed room factory (D3); G6 router-convention mirror.
- **`RealtimeRuntime`** class — registry of room descriptors + bridges WS frames to providers; validates presence + broadcast frames via Zod at dispatch boundary; runs `authorize` hook on connection (D5).
- **`RealtimeConnectionHandle`** — release-on-disconnect semantics; idempotent.
- **`mountRealtime({runtime, rooms, inputSchema?})`** — builds per-room subscription handlers ready to wire into G8 `defineSubscription` (D5).
- **3 typed error classes** — `RealtimeError` (base) + `RealtimePresenceError` (carries Zod `issues`) + `RealtimeBroadcastError` + `RealtimeRoomNotFoundError` + `RealtimeAuthorizationError`.
- **`@theokit/plugin-realtime/react` sub-path** — `RoomProvider` + `useRoom` + `useOthers` + `usePresence` + `useUpdateMyPresence` + `useBroadcast` + `useYDoc` (D4). Peer React `>=18 || >=19` optional.
- **Wire format** — `RealtimeFrame` discriminated union (`joined`/`left`/`presence-changed`/`broadcast`/`yjs-update`/`yjs-awareness`); binary Y bytes base64-encoded for JSON-safe transport in `RealtimeSubscriptionOutput`.

### Notes

- **`@theokit/sdk@>=1.7.0` REQUIRED peer.** Consumer installs `@theokit/sdk@next` (or `latest` once promoted ~2026-07-15+). Plugin uses structural types (no hard SDK import) so workspace develop works against G8 develop branch (`sdk@1.7.0`).
- **Node 22+ required.** CF Workers / Bun / Deno per-runtime adapters deferred to v0.x as separate packages OR via consumer-supplied `defineRealtimeProvider` (D8).
- **Yjs `^13` pinned.** Liveblocks canonical (`@liveblocks/yjs:peerDependencies.yjs ^13`). Yjs ^14 RC explicitly excluded (lib0 internals diverged).
- **React hooks are upstream-write deferred.** v0.1 ships local-state read hooks (useRoom/useOthers/usePresence) + optimistic-merge updater (useUpdateMyPresence). Server-side write loop (G8 subscribe upstream `.send()`) lands when G8 client API stabilizes upstream send — currently AsyncGenerator is read-only.
- **`useYDoc` throws in v0.1.** Y.Doc auto-wiring through React Context is deferred to v0.x; use `YjsRealtimeProvider` directly server-side.

### Out of scope v0.1 (deferred to v0.x)

- **CF Workers DO adapter** with hibernation — ADR D8 defers; partykit-complexity 2-week spike.
- **Bun + Deno adapters** — same trajectory as G8 D426.
- **Liveblocks DevTools-style panel** — defer to G4 follow-up plugin; Chrome DevTools Network → WS covers debugging.
- **theokit-side scanner Vite plugin** for `app/rooms/**/*.ts` auto-mount — cross-repo follow-up.
- **`@theokit/plugin-realtime-react` sibling package** — rejected per D4; same package + sub-path is canonical.
- **dogfood-app cursors-in-canvas demo** — post-implementation session.
- **npm publish** via `pnpm publish --tag next --access public` — calendar-gated ~2026-07-15+ aligned with G8 sdk@1.7.0 → @next promote cohort.

### Security threats addressed

| Threat | Mitigation |
|---|---|
| Unauthorized broadcast | `defineRoom({authorize?: (ctx) => boolean})` per-room hook; G11 `defineAuth` runs at WS upgrade boundary |
| Presence flooding | Consumer wires P#10 plugin-rate-limit at upgrade; `RealtimeRuntime.getPresence()` for ops visibility |
| Yjs update poisoning | `maxUpdateBytes` cap (default 1 MB); throws `RealtimeError({code:'yjs_update_oversized'})` |
| Y.Awareness oversized | Same `maxUpdateBytes` cap via `applyYjsAwareness` |
| Cross-room data leakage | Runtime enforces `roomId` scoping; isolation test in `tests/memory-provider.test.ts:44` |
| PII leakage in presence | Zod schema at `defineRoom` boundary; README recommends opt-in fields |

### Quality gates

- 48 unit + integration tests GREEN (6 types + 7 defineRoom + 4 provider + 7 memory + 7 yjs + 8 runtime + 2 presence-multi-client integration + 3 Yjs Awareness integration + 4 React hooks).
- `npx tsc --noEmit`: exit 0.
- `npx tsup`: `dist/index.js` 18.46 KB + `dist/index.d.ts` 12.69 KB + `dist/react/index.js` 4.93 KB + `dist/react/index.d.ts` 3.54 KB.
- `npm pack --dry-run`: 28.0 KB tarball / 9 files (zero test-file leak).
- React tests via `@vitest-environment jsdom` directive (vitest 4 compatibility).

### Deferred (calendar-gated)

- **dogfood-app cursors-in-canvas smoke test** — wire `RoomProvider({roomId: "canvas", client: Theokit})` + cursor MouseMove handler.
- **npm publish** via `pnpm publish --tag next --access public`.
- **Real R2/MinIO etc external infra smoke** — N/A (P#9 is presence/CRDT plugin; no external infra).
