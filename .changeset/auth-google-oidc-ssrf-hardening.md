---
"@theokit/auth-google": patch
---

Close an OIDC SSRF that could exfiltrate `client_secret` + the authorization code (#192). The provider now validates every URL it fetches — the discovery base and the discovered `authorization_endpoint`, `token_endpoint`, and `userinfo_endpoint` — and rejects any non-`https` URL (`GoogleAuthError` code `insecure_oidc_url`), with a loopback carve-out (`localhost`/`127.0.0.0/8`/`::1`) so local test sidecars can serve `http`. The `MOCK_GOOGLE_OIDC_BASE_URL` test override is now honored only when it targets a loopback host (else `GoogleAuthError` code `ssrf_env_override_non_loopback`), so a leaked `NODE_ENV=test` can no longer redirect the credential-bearing token exchange to an external attacker.

The audit's prescribed "discovered endpoint host must equal the base host" sub-fix was deliberately not adopted: Google's real discovery spans `accounts.google.com` / `oauth2.googleapis.com` / `openidconnect.googleapis.com`, so strict host-equality would break production sign-in. The https-except-loopback rule closes the same plaintext-exfil vector without that breakage.
