---
"@theokit/plugin-forms": patch
---

Extract `TheoForm`'s error routing into exported pure helpers — `extractFieldsFromError` and `routeActionError` — so it can be unit-tested against the single source the component actually uses (#227). Previously the test duplicated the catch-block logic, so it could pass even if the component diverged. `TheoForm`'s behavior is unchanged (ActionInputError `fields` → RHF `setError`; any other error re-thrown). Additive exports.
