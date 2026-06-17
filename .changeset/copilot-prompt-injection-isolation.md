---
"@theokit/plugin-copilot": patch
---

Isolate untrusted room text from the agent system prompt to mitigate prompt injection (#218, OWASP LLM01). `framePrompt` no longer prepends the system prompt onto the user message; it returns only a fenced user-role prompt that marks the user's text as untrusted data (and strips any forged fence markers), while the trusted system prompt is passed separately via `streamObject({ systemPrompt })`. Malicious instructions in a broadcast can no longer contaminate the system role. No public API change.
