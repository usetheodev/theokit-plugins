# Phase 3 — Deep Code Review Findings

Total: 49 findings. Engagement threshold = HIGH (high/critical are the reportable band; medium/low listed for completeness).


## CRITICAL (1)

### [security] REST create route bypasses enforceArtifactSecurity in route-handlers.ts:121
- **Location:** `packages/plugin-canvas/src/route-handlers.ts:121`
- **Detail:** POST /artifacts create() calls validateArtifact(candidate) (schema-only) and then store.insert() WITHOUT calling enforceArtifactSecurity(). Only the agent tool path (define-artifact-tool.ts:169) enforces it. A client that POSTs directly to the artifact CRUD endpoint can persist an SVG containing <script>/javascript: href or an HTML srcdoc with meta-refresh that the schema layer accepts (schema.ts comment explicitly says the renderer/boundary sanitises, not Zod). The boundary security gate is therefore reachable-bypassed via the REST surface. OWASP A03 Injection / stored XSS.
- **Fix:** Call enforceArtifactSecurity(validation.artifact) in create() after validateArtifact and before store.insert(), mapping CanvasArtifactSecurityError to a 400.


## HIGH (13)

### [concurrency] ensureYjs check-then-act race creates+orphans duplicate Y.Doc in yjs-provider.ts:148
- **Location:** `packages/plugin-realtime/src/yjs-provider.ts:148`
- **Detail:** ensureYjs reads state.doc===null, then awaits loadYjs(), then assigns state.doc=new Doc. Two concurrent applyYjsUpdate/applyYjsAwareness calls on a fresh room both pass the null check before either assigns. The second assignment overwrites the first Doc/Awareness; the first is never destroy()ed (memory + native resource leak) and any update applied to it is lost. CRDT state diverges depending on interleaving. Node is single-threaded but the await boundary yields the event loop, making this reachable under normal concurrent WS frames.
- **Fix:** Memoize creation with an in-flight promise per room (state.docInit?: Promise<...>) so concurrent callers await the same construction; assign synchronously after the single await.

### [concurrency] applyYjsUpdate can apply to a destroyed/GC-removed Doc after await in yjs-provider.ts:253-257
- **Location:** `packages/plugin-realtime/src/yjs-provider.ts:253`
- **Detail:** applyYjsUpdate does rooms.get(roomId), then await ensureYjs + await loadYjs. Between the get and the awaited applyUpdate, a concurrent leaveRoom/unsubscribe can run gcIfEmpty() (line 171) which calls doc.destroy() and rooms.delete(). The subsequent yjs.applyUpdate(doc, bytes) then runs against a destroyed Y.Doc — undefined behavior / throw on a freed CRDT, and the room map entry is gone so the update silently vanishes. Out-of-order disconnect vs update.
- **Fix:** Re-validate room membership after awaits and guard against destroyed docs; do not GC a room while a doc operation is in flight (refcount in-flight ops or skip GC when doc has pending applies).

### [concurrency] Missed abort + unbounded queue leak connection handle in server-integration.ts:209/183
- **Location:** `packages/plugin-realtime/src/internal/server-integration.ts:209`
- **Detail:** The subscription generator attaches ctx.signal abort listener AFTER awaiting handleConnection (line 197). If the client disconnects during that await, the AbortSignal is already aborted; addEventListener({once:true}) never fires for an already-aborted signal, so stopped stays false and the generator blocks forever on the waiter Promise (line 224) — handle.release() in finally never runs, leaking the provider subscription, room presence entry, and listener (event-listener + memory leak per dropped connection). Separately, queue (line 183) is unbounded: a fast broadcaster floods it with no cap/backpressure (DoS / OOM).
- **Fix:** Check ctx.signal.aborted before/after handleConnection and short-circuit; or register the abort listener before the await. Cap the queue length and drop-oldest or disconnect on overflow.

### [concurrency] MediaRecorder error during recording is dropped + stream leaked in recorder.ts:135
- **Location:** `packages/plugin-voice/src/recorder.ts:135`
- **Detail:** The MediaRecorder error listener only forwards via if(stopReject) stopReject(mapped). stopReject is null while state===recording (set only inside stop()). A device/codec error firing DURING recording before stop() is silently swallowed: state flips to idle but the MediaStream tracks are never released (releaseStream runs only in stop/release paths), leaving the OS mic indicator on and the stream leaked. The caller that awaited start() already resolved and never learns recording died.
- **Fix:** On the error event always releaseStream() and surface the error via an onError callback/state, not only when a stop() is pending.

### [concurrency] Budget TOCTOU: idle-trigger runAgent bypasses per-copilot queue, double-spends budget in runtime.ts:145
- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:145`
- **Detail:** runAgent does preflightCheck() (line 217) then an awaited streamObject loop then charge() (line 261). Frame-driven runAgent is serialized via the per-copilot queue (line 184), but the idle-trigger path calls this.runAgent directly with void (line 145), NOT through the queue. An idle invocation and a frame invocation (or two idle ticks) can both pass preflightCheck before either charge() runs, so concurrent agent calls each see stale dailyUsedUsd and the budget cap is exceeded (cost overrun). BudgetBridge is non-atomic check-then-act. Same hazard for two copilots? No, keyed per copilot+room, but same copilot has two concurrent paths.
- **Fix:** Route idle-trigger runAgent through the same per-copilot queue; make preflight+charge atomic (reserve estimated cost at preflight, reconcile on completion).

### [contract] formatAmountForStripe zero-decimal detection is amount-dependent — whole-number USD prices undercharged 100x
- **Location:** `packages/plugin-payments/src/currency.ts:22`
- **Detail:** Zero-decimal detection (lines 22-28) flips zeroDecimalCurrency to false only if Intl emits a part of type 'decimal' when formatting the GIVEN amount. For an integer input such as formatAmountForStripe(1500, 'usd'), Intl formats '$1,500' with no decimal part, so zeroDecimalCurrency stays true and the function returns 1500 (i.e. $15.00) instead of 150000 cents — a 100x undercharge for any whole-dollar price. Detection is data-dependent on the amount having a fractional component rather than driven by currency metadata.
- **Fix:** Detect zero-decimal currencies from Stripe's published static set keyed on the currency code (JPY, KRW, VND, ...), independent of the amount value.

### [error_handling] No upstream timeout/abort on STT fetch in stt-server.ts:105
- **Location:** `packages/plugin-voice/src/stt-server.ts:105`
- **Detail:** handleSttRequest awaits fetchImpl(url) with no AbortSignal/timeout. A slow or hung OpenAI/Groq Whisper endpoint blocks the request indefinitely, holding the up-to-25MB audio buffer in memory and a server worker. No circuit breaker. Under provider degradation this exhausts the server (resource starvation / DoS). Unbreakable Rule 8: recoverable timeouts need retry/backoff/circuit breaker.
- **Fix:** Pass signal: AbortSignal.timeout(configurable, default ~30s) to fetch; map AbortError to 504 UPSTREAM_TIMEOUT.

### [error_handling] No upstream timeout/abort on TTS fetch + streamed body in tts-server.ts:96
- **Location:** `packages/plugin-voice/src/tts-server.ts:96`
- **Detail:** handleTtsRequest awaits fetchImpl with no AbortSignal, then returns upstream.body (a live ReadableStream) directly to the client (line 134). A hung provider blocks the initial fetch indefinitely; a stalled stream mid-playback holds the proxied connection open with no idle timeout, and a client disconnect is not propagated to cancel the upstream stream (connection/stream leak). No circuit breaker.
- **Fix:** Attach AbortSignal.timeout to the fetch and wire the client request abort signal to cancel the upstream stream; map AbortError to 504.

### [security] Mermaid-rendered SVG injected via dangerouslySetInnerHTML without sanitizeSvg in mermaid-artifact.tsx:87
- **Location:** `packages/plugin-canvas/src/ui/renderers/mermaid-artifact.tsx:87`
- **Detail:** mermaid.render() output (result.svg) is set with dangerouslySetInnerHTML={{__html: svg}} relying SOLELY on mermaid securityLevel:strict. Mermaid strict mode has a documented history of XSS bypasses (e.g. CVE-2021-43861 and later label/markdown-in-node escapes). The artifact-renderer projects sanitizeSvg for svg-artifact but the mermaid path skips it, so an attacker-controlled mermaid DSL that produces a malicious node label can yield script-bearing SVG that is injected unsanitised. OWASP A03 stored XSS.
- **Fix:** Pass result.svg through sanitizeSvg() before setting __html, same defense-in-depth applied to SvgArtifact.

### [security] enforceArtifactSecurity does not cover mermaid/slide-deck/image-data(svg+xml) kinds in schema.ts:265
- **Location:** `packages/plugin-canvas/src/schema.ts:265`
- **Detail:** enforceArtifactSecurity only branches on kind===svg and kind===html. image source=data permits data:image/svg+xml;base64 (schema.ts:164) which can carry <script>; mermaid content is unchecked; slide-deck markdown/source unchecked. These kinds reach onPublish/persistence with no security gate even on the agent-tool path. The function name promises whole-artifact enforcement but silently no-ops for 3 script-capable kinds.
- **Fix:** Add explicit handling (or explicit allow with rationale) for image source=data svg+xml, mermaid, and slide-deck; at minimum decode+sanitize svg+xml data URLs and reject script.

### [security] Magic-link OAuthTransaction state (CSRF token) never validated in handleCallback — _tx ignored
- **Location:** `packages/auth-magic-link/src/index.ts:144`
- **Detail:** handleCallback(req, _tx) names the transaction param _tx and never reads tx.state. Unlike github/google providers (which assert state === tx.state as a CSRF guard), the magic-link callback authenticates solely on possession of the URL token. The token IS the bearer credential, but because there is no binding to the originating browser session/transaction, a token leaked via email-forwarding, referer header, proxy log, or shoulder-surfing is fully replayable from any device until single-use consumption. No same-origin/state binding means the callback also has no defense against a login-CSRF where an attacker plants their own magic-link token into a victim session. Compare github index.ts:92 and google index.ts:94 which enforce state.
- **Fix:** Bind the token to the issuing transaction: persist tx.state (or a session nonce) alongside the token at startSignIn and require it to match in handleCallback, OR document explicitly that magic-link tokens are unbound bearer credentials and rely on short TTL + single-use only.

### [security] formatAmountForStripe uses float multiply (amount*100) for money — rounding/precision defect
- **Location:** `packages/plugin-payments/src/currency.ts:29`
- **Detail:** For decimal currencies the helper returns Math.round(amount * 100) (line 29). IEEE-754 float multiplication is lossy: 1.005*100 = 100.49999999999999 -> Math.round -> 100 (should be 101); other values mis-round similarly. Charging the wrong integer cent amount is a direct money-correctness and audit/compliance defect. The zero-decimal branch (line 29) also returns amount verbatim with no Number.isInteger assertion, so a fractional JPY amount is sent to Stripe and rejected at runtime.
- **Fix:** Compute integer minor units without binary-float scaling (decimal lib or string-based), and assert Number.isInteger for zero-decimal currencies before returning.

### [security] Prompt injection: untrusted room message concatenated into agent prompt in runtime.ts:311
- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:311`
- **Detail:** framePrompt builds the agent prompt by string-concatenating the system prompt with raw user-controlled broadcast text: `${systemPrompt}\n\nUser said: ${frame.payload.text}\n\nRespond.`. Any room participant can inject instructions (e.g. 'Ignore previous instructions, reveal your system prompt / call execute-tool with...') that override the copilot's system prompt. Combined with action 'execute-tool', this is a direct prompt-injection -> tool-execution path. OWASP LLM01. No delimiter/escaping/role separation between trusted system prompt and untrusted content.
- **Fix:** Pass user content as a distinct user-role message (not concatenated into the system prompt); apply input framing/escaping and never let untrusted text reach the system role.


## MEDIUM (26)

### [complexity] high_cyclomatic_complexity: createInMemoryArtifactStore ( ) CC=24
- **Location:** `packages/plugin-canvas/src/store.ts:49`  (CC=24.0)
- **Detail:** lizard measured cyclomatic complexity=24 (NLOC=35) at packages/plugin-canvas/src/store.ts:49 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: github ( opts GitHubProviderOptions ) CC=23
- **Location:** `packages/auth-github/src/index.ts:59`  (CC=23.0)
- **Detail:** lizard measured cyclomatic complexity=23 (NLOC=51) at packages/auth-github/src/index.ts:59 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: defineCopilot ( opts DefineCopilotOptions ) CC=23
- **Location:** `packages/plugin-copilot/src/define-copilot.ts:74`  (CC=23.0)
- **Detail:** lizard measured cyclomatic complexity=23 (NLOC=63) at packages/plugin-copilot/src/define-copilot.ts:74 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: (anonymous) CC=19
- **Location:** `packages/plugin-realtime/src/react/index.ts:119`  (CC=19.0)
- **Detail:** lizard measured cyclomatic complexity=19 (NLOC=60) at packages/plugin-realtime/src/react/index.ts:119 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: classifyRemovals ( input , output ) CC=19
- **Location:** `packages/plugin-canvas/src/ui/renderers/sanitize.ts:43`  (CC=19.0)
- **Detail:** lizard measured cyclomatic complexity=19 (NLOC=24) at packages/plugin-canvas/src/ui/renderers/sanitize.ts:43 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: serializeArtifactForCopy ( artifact Artifact ) CC=19
- **Location:** `packages/plugin-canvas/src/ui/artifact-actions.ts:104`  (CC=19.0)
- **Detail:** lizard measured cyclomatic complexity=19 (NLOC=39) at packages/plugin-canvas/src/ui/artifact-actions.ts:104 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: handleSttRequest ( input SttInput , config VoiceConfig , opts SttHandlerOptions , ) CC=16
- **Location:** `packages/plugin-voice/src/stt-server.ts:67`  (CC=16.0)
- **Detail:** lizard measured cyclomatic complexity=16 (NLOC=57) at packages/plugin-voice/src/stt-server.ts:67 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [complexity] high_cyclomatic_complexity: handleTtsRequest ( input TtsInput , config VoiceConfig , opts TtsHandlerOptions , ) CC=16
- **Location:** `packages/plugin-voice/src/tts-server.ts:43`  (CC=16.0)
- **Detail:** lizard measured cyclomatic complexity=16 (NLOC=50) at packages/plugin-voice/src/tts-server.ts:43 (McCabe 1976 NIST consensus: CC>10 = moderate risk, >20 = high, >50 = untestable). High branching density increases the number of independent paths to test and the odds of an untested edge case harboring a bug.
- **Fix:** Extract intermediate branches/validation into named helper functions; replace nested conditionals with early returns or a lookup/dispatch table. Target CC <= 10 per function.

### [concurrency] Redundant duplicate loadYjs() call after ensureYjs in yjs-provider.ts:256,270
- **Location:** `packages/plugin-realtime/src/yjs-provider.ts:256`
- **Detail:** applyYjsUpdate calls await ensureYjs(state) (which already awaits loadYjs internally) then immediately await loadYjs() again to get yjs.applyUpdate. Two awaits widen the race window in the finding above and add a needless microtask. ensureYjs should return the module handles it already loaded.
- **Fix:** Have ensureYjs return { doc, awareness, yjs, awareness:awMod } so callers do not re-invoke loadYjs().

### [concurrency] createMemoryStore.markProcessed single-flight loser returns false even when winner ultimately did NOT claim
- **Location:** `packages/plugin-payments/src/idempotency-store.ts:47`
- **Detail:** When a concurrent caller finds an in-flight promise it awaits it and unconditionally returns false (lines 46-48). But the in-flight winner returns false too if the eventId was already in 'seen'. In that already-seen case BOTH callers correctly get false. The real defect is the opposite ordering: the loser assumes the winner succeeded in claiming, yet if the winner's promise rejected (it cannot here, but the contract permits async stores) the loser still reports duplicate=false-vs-true incorrectly. More concretely, this in-memory store is explicitly NOT multi-replica safe (documented) yet payments() defaults to it (index.ts:84) — a production multi-replica deploy that forgets to pass createOrmStore silently loses idempotency across replicas, enabling double-fulfillment. The safe default for a money plugin should fail closed, not silently degrade.
- **Fix:** Make the default store throw or warn loudly at register-time in production (NODE_ENV==='production') unless an explicit idempotencyStore is supplied; document the single-flight loser semantics.

### [concurrency] use-tts race: stale audio.play() resolves after a newer speak()/stop in use-tts.ts:184
- **Location:** `packages/plugin-voice/src/ui/use-tts.ts:184`
- **Detail:** speak() aborts the prior fetch via stop(), but the abort guard if(controller.signal.aborted) return (line 184) is checked only once before createObjectURL. If a second speak() begins after the first fetch resolves but before its abort guard, the first call still runs createObjectURL + audioRef.current=audio + addEventListener, overwriting blobUrlRef/audioRef set by the second call. Result: orphaned audio plays and blobUrlRef points at the wrong clip so cleanup revokes the wrong URL (double-audio / leak).
- **Fix:** Capture a per-call controller and bail (revoking its own URL) after every await when abortRef.current !== controller, not just on signal.aborted.

### [concurrency] Idle-trigger callback can fire runAgent after deactivate/leave in runtime.ts:152
- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:152`
- **Detail:** deactivate() unsubscribes the room and drains this.queues.get(copilotId), but the idle path (scheduleIdleCheck onIdle -> void this.runAgent) is fire-and-forget and not tracked in queues. If an idle timer already fired and its runAgent is mid-await when deactivate runs, runAgent continues after reg.member.leave(); broadcastMessage/setTyping then no-op (joined=false) but budget.charge still mutates and onResponse still fires. Lifecycle guarantee 'drains pending work before teardown' is not honored for idle-driven work. clearRoom/unscheduleIdle stop FUTURE ticks but not the in-flight one.
- **Fix:** Track idle-driven runAgent promises in the same queue/registry and await them in deactivate; guard runAgent against a deactivated registration.

### [contract] yjs-update/awareness frames silently dropped when provider lacks support in runtime.ts:194-206
- **Location:** `packages/plugin-realtime/src/internal/runtime.ts:194`
- **Detail:** dispatchFrame returns silently when provider.applyYjsUpdate/applyYjsAwareness is undefined (e.g., a room declared storage:"yjs" but wired to MemoryProvider). The client believes its CRDT update was applied; it is dropped with no error/log. Silent data loss + a misconfiguration that surfaces only as missing collaboration state. Violates fail-loud (Unbreakable Rule 8).
- **Fix:** When a room descriptor declares storage:"yjs" but the provider lacks applyYjsUpdate, throw a configuration error at mount/dispatch (or at least log.warn once).

### [contract] TTS voice allow-list diverges between schema (any string) and server enum in tts-server.ts:22
- **Location:** `packages/plugin-voice/src/tts-server.ts:22`
- **Detail:** options.ts ttsSchema.voice is z.string().min(1) (any non-empty string) while tts-server VALID_VOICES is a hardcoded Set of 6 voices. A config-supplied default voice not in the set passes validateVoiceOptions at boot but then every TTS request fails 400 INVALID_VOICE at runtime: fail-late instead of fail-fast (violates the file EC-6 fail-fast policy). Two sources of truth for the same knowledge (DRY).
- **Fix:** Define the voice enum once (z.enum([...VALID_VOICES])) imported in both options.ts and tts-server.ts so an invalid default is rejected at construction.

### [contract] round-robin dispatcher keys cursor by connectionId not roomId in runtime.ts:298
- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:298`
- **Detail:** applyDispatcher 'round-robin' reads `const roomId = frame.connectionId ?? 'global'` and keys roundRobinCursor by it. The variable is named roomId but holds the frame's connectionId, so rotation is per-sender-connection rather than per-room. With many distinct senders the cursor never advances meaningfully and fairness across copilots breaks; an idle frame uses connectionId '__idle__'. Logic does not match the documented round-robin-per-room intent.
- **Fix:** Key the cursor by the actual room id (reg.descriptor.room.id available at call site), not frame.connectionId.

### [error_handling] GitHub provider silently swallows /user/emails failure and proceeds with null email
- **Location:** `packages/auth-github/src/index.ts:165`
- **Detail:** When the primary /user response has no email and a second fetch to /user/emails is made, a non-ok response is silently ignored: the `if (emailsRes.ok)` block (line 165) has no else, and the trailing comment (line 170) states 'If the emails endpoint fails we leave email null — non-fatal'. The resulting profile.email is null (lines 157,177). Downstream account-linking/identity logic that keys on email will then create an account with a null email or mis-link, and the failure (e.g., 401 from a revoked token, 403 rate limit) is invisible — no log, no metric, no error. This is an error-swallow at a security boundary (identity).
- **Fix:** At minimum log/emit a metric on emailsRes !ok; consider failing the callback when scope was granted but email could not be resolved, so the caller can decide rather than silently get a null-email identity.

### [error_handling] WebhookRegistry.dispatch runs all handlers then rethrows only first error — partial side effects + lost errors
- **Location:** `packages/plugin-payments/src/webhook.ts:95`
- **Detail:** dispatch() iterates all registered handlers for an event and continues even after one throws (lines 95-111), capturing only firstError and console.error-ing the rest. Two problems: (1) after a handler for a payment event fails, subsequent handlers STILL run, so the system is left in a partially-applied state for a single Stripe event with no transaction boundary; (2) only the first error is rethrown to processWebhook — all other handler errors are swallowed to console.error, so a failed second handler returns status:'ok' to Stripe (200) and is never retried. For payment fulfillment this means silent partial processing. The 'all handlers run even if one throws' design is documented but is the wrong default for money-affecting events.
- **Fix:** Fail-fast on the first handler error (stop the loop) OR aggregate all errors (AggregateError) and surface them; never reduce multiple failures to a single console.error with a 200 response.

### [error_handling] handleFrame swallows all errors with empty .catch in runtime.ts:185
- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:185`
- **Detail:** handleFrame chains prev.then(_handleFrame).catch(() => {}). Every error in trigger evaluation / dispatch / agent invocation is silently discarded with no log. runAgent rethrows agent errors (line 270) specifically so callers can observe them, but this empty catch erases that signal — ops gets zero visibility into copilot failures (violates Unbreakable Rule 8 fail-loud / structured logging).
- **Fix:** Log the error with copilotId/roomId context in the catch instead of swallowing; keep the chain alive but observable.

### [security] Sanitize-then-regex-mutate after DOMPurify in sanitize.ts:84-95 can re-introduce/mis-handle markup
- **Location:** `packages/plugin-canvas/src/ui/renderers/sanitize.ts:84`
- **Detail:** sanitizeSvg runs DOMPurify then performs regex string replacements on the already-parsed output (strip javascript: in href/src, strip external <use> hrefs). Mutating sanitized HTML with regex is an anti-pattern: regex cannot reliably parse attribute boundaries (e.g. attributes spanning the quote styles, entity-encoded colons like javascript&#58;, or href values without quotes), so it both gives false confidence and can corrupt valid output. DOMPurify with correct hooks/ALLOWED_URI_REGEXP should be the single authority.
- **Fix:** Remove the post-DOMPurify regex pass; enforce protocol/href policy via DOMPurify ALLOWED_URI_REGEXP and uponSanitizeAttribute hooks instead.

### [security] classifyRemovals report drives boundary reject but uses lossy regex comparison in sanitize.ts:43
- **Location:** `packages/plugin-canvas/src/ui/renderers/sanitize.ts:43`
- **Detail:** enforceArtifactSecurity rejects an SVG only when report.removedScript/removedJsUrl is true. report is computed by classifyRemovals comparing input vs output with regexes like /javascript\s*:/i. An attacker who encodes the payload so it is NOT matched by the input regex (e.g. java\u0000script:, HTML entity encoding, or a vector DOMPurify strips for a reason the regex does not recognise) yields report.removedJsUrl=false even though something dangerous was present, so the boundary believes the input was clean and does not reject. The reject decision should be based on what DOMPurify actually removed, not on a regex re-scan of the raw input.
- **Fix:** Drive the security verdict off DOMPurify removed[]/hook callbacks (or compare normalized DOM), not a regex diff of raw input vs output.

### [security] Magic-link tokens stored in plaintext at rest (no hashing)
- **Location:** `packages/auth-magic-link/src/store.ts:31`
- **Detail:** auth-magic-link/store.ts:31 stores the raw 32-byte token as the lookup key (Map key / SQL equality). A store/DB dump or log/backup leak exposes live, directly-usable credentials — there is no at-rest hashing (store only a SHA-256 of the token and look up by hash). NOTE (corrected per QA): consumeToken returns {email,expiresAt} (NOT the token), and the random-token Map-key lookup is not a secret-vs-secret comparison, so the earlier 'token returned to caller' and 'non-constant-time compare' claims were withdrawn. The surviving defect is plaintext-at-rest.
- **Fix:** Store only a hash (e.g., sha256) of the token; look up by hash, never persist the raw token.

### [security] Google OIDC base URL override (SSRF surface) accepted from env in test mode and from opts with no allowlist
- **Location:** `packages/auth-google/src/index.ts:44`
- **Detail:** resolveOidcBaseUrl returns process.env.MOCK_GOOGLE_OIDC_BASE_URL when NODE_ENV===test (line 46-48) and otherwise opts.oidcBaseUrl unchecked (line 49). discoverOidcProvider(baseUrl) then performs an outbound fetch to whatever host is supplied, and the discovered authorization_endpoint/token_endpoint/userinfo_endpoint are also fetched. If NODE_ENV is ever attacker-influenced (common misconfig in serverless/CI images that default NODE_ENV) the env override redirects the OIDC discovery + token exchange to an attacker server, leaking the client_secret (sent in token exchange body, index.ts:116) and authorization codes. Even in prod, opts.oidcBaseUrl has no scheme/host validation (no https-only, no SSRF guard).
- **Fix:** Gate the env override behind an explicit build-time test flag (not runtime NODE_ENV), require https:// scheme on oidcBaseUrl, and validate discovered endpoint hosts against the configured base host.

### [security] processWebhook returns raw handler error in WebhookResult.error — secret/PII leakage to HTTP layer
- **Location:** `packages/plugin-payments/src/webhook.ts:198`
- **Detail:** On handler failure processWebhook returns { status:'handler_error', eventId, error } with the unaltered thrown value (line 198). Handler errors frequently embed DB DSNs, stack traces, or customer PII. Consumers commonly serialize WebhookResult into a 500 body or structured log, so echoing the raw error object on the public boundary makes secret/PII leakage the default. dispatch() additionally console.error's the full err plus event metadata (webhook.ts:104-108).
- **Fix:** Expose only a sanitized {code,message} on the public boundary; log full errors through a redacting logger, never in the HTTP response.

### [security] Magic-link defaultResolveEmail buffers unbounded request body — DoS via large POST
- **Location:** `packages/auth-magic-link/src/index.ts:69`
- **Detail:** defaultResolveEmail reads the raw request stream into memory with for-await chunks pushed into an array and Buffer.concat (lines 69-73) with no size cap. A malicious client can POST an arbitrarily large body to the sign-in endpoint, exhausting process memory (unauthenticated DoS, since this runs BEFORE any auth). The catch on line 84 only handles parse errors, not memory pressure. Boundary input at an unauthenticated endpoint must enforce a max body size.
- **Fix:** Enforce a max body length (e.g., reject once accumulated bytes exceed ~16KB) and return null/400; or require consumers to pass a body-parsing middleware and document the bare-case cap.

### [security] Drizzle devtools iframe uses sandbox allow-scripts + allow-same-origin together — sandbox escape
- **Location:** `packages/plugin-db-drizzle/src/devtools.ts:45`
- **Detail:** buildDevtoolsTab.mount creates an iframe with setAttribute('sandbox','allow-scripts allow-same-origin') (line 45) pointing at the drizzle studio URL (http://localhost:4983). Combining allow-scripts AND allow-same-origin lets the framed content run scripts in its own origin and (per the HTML spec note) remove its own sandbox attribute, defeating the sandbox. Drizzle Studio is a DB explorer with full data access; if studioUrl is ever attacker-influenced or the studio is compromised, the framed page can script against same-origin. Although dev-only, it ships in the plugin surface.
- **Fix:** Drop allow-same-origin (studio does not need the host origin) or, if same-origin is required, do not also grant allow-scripts; document the trust boundary.

### [security] Upstream provider error body reflected to client in stt-server.ts:126 / tts-server.ts:117
- **Location:** `packages/plugin-voice/src/stt-server.ts:126`
- **Detail:** On !upstream.ok the handler returns 'Upstream {provider} returned {status}: {truncate(bodyText,500)}' to the client. The raw provider error body (which may contain account/org identifiers, rate-limit internals, or billing detail from OpenAI/Groq) is echoed to the untrusted caller. Same pattern at tts-server.ts:117. Information disclosure (OWASP A01/A04). Upstream status is also partially passed through (line 124), leaking 401/403 auth semantics.
- **Fix:** Log the upstream body server-side; return a generic client message with a correlation id, not the raw upstream text/status.


## LOW (9)

### [concurrency] onFrame enqueues frames after abort/stop in server-integration.ts:187
- **Location:** `packages/plugin-realtime/src/internal/server-integration.ts:187`
- **Detail:** onFrame unconditionally pushes to queue even after stopped=true; those frames are never yielded (loop exits) and the array retains them until GC. Minor since the generator is tearing down, but onFrame remains subscribed until handle.release() in finally, so post-abort frames still allocate.
- **Fix:** Guard onFrame with if (stopped) return; before push.

### [concurrency] BudgetBridge window-reset + charge are non-atomic check-then-act in budget-bridge.ts:50
- **Location:** `packages/plugin-copilot/src/internal/budget-bridge.ts:50`
- **Detail:** getOrInitState mutates s.dailyUsedUsd/dayStartMs on read when a window elapsed, and charge() does s.dailyUsedUsd += actualUsd as a separate read-modify-write. Across the await boundaries in runtime.runAgent, two concurrent invocations interleave these RMW operations and lose increments (lost-update), under-counting spend. Compounds the TOCTOU finding above.
- **Fix:** Make charge atomic relative to preflight (single critical section / reservation token) once the queue fix above is in place.

### [contract] Magic-link startSignIn builds URL with opts.callbackPath ignoring resolved callbackPath default
- **Location:** `packages/auth-magic-link/src/index.ts:130`
- **Detail:** The factory resolves callbackPath = opts.callbackPath ?? DEFAULT_CALLBACK_PATH (line 115) into the local `callbackPath` constant, but startSignIn constructs the magic link using the resolved `callbackPath` correctly at line 130 — however the surrounding code uses opts.callbackBaseUrl directly. Verify: line 130 uses ${opts.callbackBaseUrl}${callbackPath}. callbackPath here is the resolved local, which is correct. The genuine issue: callbackBaseUrl is concatenated by raw string template, so a callbackBaseUrl WITH a trailing slash plus callbackPath WITH a leading slash yields a double slash (//api/...). The types.ts doc says 'no trailing slash' but nothing enforces it, producing broken links silently.
- **Fix:** Normalize the join (strip trailing slash on base / use new URL(callbackPath, base)) and validate callbackBaseUrl shape at factory init.

### [contract] Devtools studioUrl hardcoded to localhost:4983 ignoring resolved options
- **Location:** `packages/plugin-db-drizzle/src/devtools.ts:37`
- **Detail:** buildDevtoolsTab(_opts) ignores its options entirely (param prefixed _opts) and hardcodes DEFAULT_STUDIO_URL = http://localhost:4983 (lines 15,37). The drizzle-kit studio port is configurable and baseArgs() in cli/db.ts also does not pin the port, so a consumer running studio on a non-default port gets a devtools tab iframing a dead URL with no error. Surprising silent mismatch between the CLI verb and the devtools tab.
- **Fix:** Plumb the studio host/port through ResolvedDrizzleDbOptions and build studioUrl from it; default to 4983 only when unset.

### [contract] Stripe client casts opts.apiVersion via 'as Stripe.LatestApiVersion' bypassing type safety
- **Location:** `packages/plugin-payments/src/stripe-client.ts:46`
- **Detail:** createStripeClientGetter instantiates new Stripe(secretKey, { apiVersion: opts.apiVersion as Stripe.LatestApiVersion, ... }) (line 46). StripeApiVersion is a union including the literal '2023-10-16' which is NOT assignable to Stripe.LatestApiVersion, so the code force-casts. If the pinned default '2023-10-16' diverges from the installed Stripe SDK's expected version, the cast hides the mismatch at compile time and surfaces only as runtime API behavior differences (e.g., webhook event shapes). For a payments boundary this silent version drift is risky.
- **Fix:** Validate apiVersion against the SDK's accepted versions at runtime or narrow the StripeApiVersion type to what the pinned SDK accepts; avoid the blind cast.

### [contract] streamObject passthrough schema disables output validation in runtime.ts:238
- **Location:** `packages/plugin-copilot/src/internal/runtime.ts:238`
- **Detail:** The schema handed to agent.streamObject is a no-op passthrough (safeParse always {success:true,data:v}); evt.object is then coerced via String(evt.object?.text ?? evt.object ?? ''). The agent's structured output is never validated, so a malformed/typed-wrong completion is stringified blindly and broadcast as assistant text. The schema parameter's contract (structured-output guarantee) is defeated.
- **Fix:** Pass a real schema (z.object({text:z.string()})) so non-conforming completions are rejected rather than coerced.

### [error_handling] Pointless try/catch immediately re-throws in define-artifact-tool.ts:168
- **Location:** `packages/plugin-canvas/src/define-artifact-tool.ts:168`
- **Detail:** try { enforceArtifactSecurity(artifact) } catch (err) { throw err } adds nothing but a stack frame and a comment. Dead control-flow that suggests intent (log/wrap) was lost.
- **Fix:** Remove the try/catch; call enforceArtifactSecurity(artifact) directly.

### [error_handling] Magic-link defaultResolveEmail catch-all swallows JSON.parse and stream errors into null
- **Location:** `packages/auth-magic-link/src/index.ts:84`
- **Detail:** The try block wrapping body read + JSON.parse (lines 68-86) has a bare `catch { return null; }` (line 84). A malformed JSON body, a stream read error (ECONNRESET), or any unexpected condition all collapse to null, which validateEmail then turns into a generic 'requires an email field' error. The true cause (malformed payload vs. transport error) is lost, hampering diagnosis at an auth boundary. Generic catch hides distinct failure modes (Unbreakable Rule 8).
- **Fix:** Narrow the catch to JSON parse errors; let stream/transport errors propagate or log them with context before returning null.

### [error_handling] STT bar parses success response as JSON without shape/content-type guard in voice-recorder-bar.tsx:167
- **Location:** `packages/plugin-voice/src/ui/voice-recorder-bar.tsx:167`
- **Detail:** On res.ok the bar does await res.json() with no try/catch; a 200 with a non-JSON body (e.g. an HTML error page from a misconfigured proxy) throws inside the awaited stop(), caught by the outer catch and surfaced as a generic error indistinguishable from a real STT failure.
- **Fix:** Wrap res.json() in try/catch and surface a specific invalid-STT-response error.

