---
"@theokit/plugin-realtime": patch
---

Harden the server subscription bridge against mid-stream aborts and slow consumers (#195, #198). The abort listener is now registered before the `handleConnection` await (and an already-aborted signal is handled up front), so an abort during connection setup is observed instead of leaving the generator blocked forever and leaking the connection handle + listener; the listener is removed on both the error and normal/abort exit paths. The per-subscription frame queue is now bounded (`MAX_QUEUED_FRAMES`): on overflow the connection is disconnected (close code 1013, "try again later") so the client reconnects and resyncs rather than the server buffering without limit, and `onFrame` drops frames once stopped/aborted. No public API change.
