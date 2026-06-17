---
"@theokit/auth-magic-link": patch
---

Harden magic-link request handling: the default email resolver now caps the request body it buffers (16 KB) to prevent a large-POST DoS (#204) and narrows its error handling so transport/stream errors propagate instead of being silently swallowed to a null email (#209). The callback URL is built via the URL API (no double slash when the base has a trailing slash), and `magicLink()` now validates `callbackBaseUrl` at construction — throwing `MagicLinkConfigError` if it is not an absolute http(s) URL (#205).
