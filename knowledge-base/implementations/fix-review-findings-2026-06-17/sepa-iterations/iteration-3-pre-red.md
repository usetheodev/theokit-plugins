# SEPA pre-RED — iter 3 — T2.1 (F-arch-2)
Design: prune both maps in unregisterCopilot AFTER registry.delete when copilotsInRoom(roomId) empty. Ordering OK.
[CRITICAL 1]: single-copilot fast-path (length===1 → copilots[0]) bypasses cursor → 1-copilot re-register RED is born-GREEN. Correct RED: 2 copilots → frame (cursor=1) → unregister both → register 2 fresh → frame → WITHOUT prune cursor=1, 1%2=1 → 2nd responds; WITH prune cursor reset → 1st responds. Assert 1st-registered responds.
[CRITICAL 2]: TriggerEvaluator.clearRoom may be room-scoped (pre-existing) — don't worsen; test re-registers fresh copilots so no entanglement.
Behavior-assertion (no test-only accessor — rules/testing.md §6). Scope: runtime.ts + runtime.test.ts.
