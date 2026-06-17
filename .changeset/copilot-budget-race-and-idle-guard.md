---
"@theokit/plugin-copilot": patch
---

Make copilot budget accounting race-safe and guard idle triggers (#219, #223, #221). Idle-trigger `runAgent` now goes through the same per-copilot serialization queue as broadcasts, so an idle invocation can no longer run concurrently with a broadcast and double-spend. The budget preflight is replaced by an atomic `reserve` (check + hold the estimate in one synchronous step, single window read), reconciled to the actual cost on success and released on failure/cancellation — closing the TOCTOU/double-spend (#219), the non-atomic window-reset-then-charge (#223), and ensuring a failed invocation does not leak reserved budget (EC-2). An idle trigger that fires during or after `deactivate()` is now a no-op (an `active` flag is flipped first and checked inside every queued task) (#221). Internal `@internal` machinery only — no public API change.
