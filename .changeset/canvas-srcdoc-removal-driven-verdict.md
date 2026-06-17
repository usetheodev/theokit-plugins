---
"@theokit/plugin-canvas": patch
---

Harden the HTML `srcdoc` security verdict (review findings F-arch-1, F-sec-1). `sanitizeHtmlSrcdoc` previously decided whether to flag a meta-refresh with a regex that only matched a **quoted** `http-equiv`, so an unquoted `<meta http-equiv=refresh>` bypassed `enforceArtifactSecurity` and the artifact passed as clean. The verdict now derives from what DOMPurify actually removed — parsed as a whole document (the way a browser renders an iframe `srcdoc`, hoisting `<meta>` into `<head>` where the refresh fires) — and folds every dangerous-removal signal (meta-refresh, iframe, object, embed, on-handler, `javascript:`/`data:` URLs) into the `removedScript` flag the boundary checks. No public API change.
