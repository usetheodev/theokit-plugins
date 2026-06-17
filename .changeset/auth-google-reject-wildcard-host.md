---
"@theokit/auth-google": patch
---

Reject `http://0.0.0.0` OIDC endpoints as insecure (review finding F-sec-3). `isLoopbackHost` previously treated `0.0.0.0` as loopback and exempted it from the https-only OIDC URL rule, so a poisoned discovery document pointing an endpoint at `http://0.0.0.0:PORT` could carry a `client_secret`-bearing request over plaintext. `0.0.0.0` is the wildcard/INADDR_ANY bind address, not a loopback destination — it is no longer exempt (the normalized short form `http://0/` is rejected by the same omission). Genuine loopback hosts (`localhost`, `127.0.0.0/8`, `::1`) remain http-exempt. No public API change.
