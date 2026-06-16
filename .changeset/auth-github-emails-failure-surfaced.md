---
"@theokit/auth-github": patch
---

Surface a failed `/user/emails` fetch instead of silently returning a null-email identity (#203). When the `user:email` scope was granted and `/user` returned no email, a non-ok `/user/emails` response now throws `GitHubAuthError` with code `emails_fetch_failed`, letting the caller decide (retry / degrade / abort) rather than producing a broken account. A genuinely email-less account — endpoint succeeds but the user has no verified address — still resolves to a documented `email: null`, distinct from the fetch failure.
