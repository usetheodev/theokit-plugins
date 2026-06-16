# SEPA pre-RED — iter 1 — T1.1 (CRITICAL #176)
- Placement: enforceArtifactSecurity after validateArtifact ok-check, before `let toInsert`.
- [CRITICAL] errorToResponse maps CanvasArtifactSecurityError -> 500 (isCanvasError). Use LOCAL try/catch around enforce -> jsonError(400, reason, message). Error has `.reason` (NOT `.code`).
- [CRITICAL] vacuous-RED: use svg (content '<svg...><script>') + html (srcdoc meta-refresh, NOT content). Assert exact 400 + code.
- Pillar (a): create() is the real caller. No metric.
