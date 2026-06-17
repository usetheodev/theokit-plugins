---
"@theokit/plugin-copilot": patch
---

Release the budget reservation when `setTyping(true)` throws (review finding F-conc-2). The initial typing-indicator update was awaited outside the try block that holds the reservation's reconcile/release, so a throw propagated past the release and left the estimated cost held until the budget window reset. The call is now inside the try, so a failed typing update routes through catch → `release(reservation)`. No public API change.
