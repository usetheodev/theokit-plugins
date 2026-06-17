# Phase 4 — Test Audit Findings

65 test files audited; 544 total tests counted.

Pyramid: healthy in VOLUME (unit-weighted) but INVERTED in PROTECTION — security/concurrency/timeout boundaries (where the confirmed Phase-3 defects live) are systematically untested. Determinism weak spot in plugin-copilot (real setTimeout, no fake timers; real-LLM test env-gated).

## HIGH (10)

### No test guards currency.ts integer-amount ambiguity (Phase-3 100x undercharge)
- **Location:** `packages/plugin-payments/tests/checkout.test.ts:77`
- **Gap:** Phase-3 confirmed a 100x undercharge risk in formatAmountForStripe (currency.ts:16-30): for decimal currencies it blindly does Math.round(amount*100). The test suite only covers amount=1.5->150 and JPY pass-through. There is NO test pinning the public contract that amount is in MAJOR units, no test for whole-number USD (formatAmountForStripe(10,'USD') must be 1000), and no test detecting the failure mode where a caller passing an already-in-cents integer is silently multiplied again, or a major-unit value is under-charged. With only 1.5->150 asserted, a regression that drops the *100 (returning 1 cent for $1.00) or that mishandles integer dollars would pass.
- **Fix:** Add tests: formatAmountForStripe(10,'USD')===1000; formatAmountForStripe(0,'USD')===0; formatAmountForStripe(99.99,'USD')===9999; assert a documented contract for negative amounts. Pin the major-unit contract so the 100x defect cannot regress silently.

### Webhook: no test asserts a throwing handler leaves event UNmarked (idempotency-on-failure)
- **Location:** `packages/plugin-payments/tests/webhook.test.ts:345`
- **Gap:** Phase-3 flagged webhook idempotency/dispatch ordering. The handler_error test (webhook.test.ts:345) asserts status===handler_error but does NOT assert whether the event id was recorded in the idempotency store BEFORE the handler ran. If processWebhook marks the event processed despite the handler throwing, Stripe's automatic retry of that delivery is treated as a duplicate and silently dropped, so the failed side-effect (e.g. DB write) never completes = lost money/state. The dup test at line 274 only proves marking-on-success; the failure ordering is the money-critical invariant and is untested.
- **Fix:** Add test: register a handler that throws; call processWebhook twice with the same signed payload; assert the handler is invoked on BOTH deliveries (event NOT marked processed after a throw), or assert the documented at-least-once contract explicitly. Lock the mark-AFTER-success ordering.

### No test asserts the REST POST /artifacts route enforces security (CRITICAL bypass route-handlers.ts:121)
- **Location:** `packages/plugin-canvas/tests/route-handlers.test.ts:32`
- **Gap:** Phase-3 critical defect #176: createArtifactRouteHandlers.create() does NOT call enforceArtifactSecurity, while the LLM tool path (define-artifact-tool) DOES (proven by define-artifact-tool.test.ts:84). route-handlers.test.ts has 16 cases (INVALID_BODY/INVALID_ARTIFACT/500-leak) but ZERO that submit a malicious artifact (svg <script>, html meta-refresh, javascript: URL) and assert a 4xx rejection. The test suite actively certifies the bypassed behavior as correct (201).
- **Fix:** Add test: POST a svg artifact with <script> (and an html artifact with meta-refresh) to handlers.create() and assert status is a 4xx security rejection, mirroring define-artifact-tool.test.ts:84. This test fails today against the prod defect.

### enforceArtifactSecurity untested for mermaid/slide-deck/image-data kinds (schema.ts:265)
- **Location:** `packages/plugin-canvas/tests/schema.test.ts:357`
- **Gap:** Phase-3 defect #178: enforceArtifactSecurity does not cover mermaid, slide-deck, or image-data (data:image/svg+xml) kinds. schema.test.ts enforceArtifactSecurity block only exercises kind=svg and kind=html. The exact kinds that bypass enforcement in prod have no test, so the gap is invisible.
- **Fix:** Add cases feeding a mermaid artifact and a data:image/svg+xml image-data artifact with embedded script/js-url and assert CanvasArtifactSecurityError is thrown.

### Mermaid renderer SVG-sanitization (dangerouslySetInnerHTML XSS) untested (mermaid-artifact.tsx:87)
- **Location:** `packages/plugin-canvas/tests/artifact-renderer.test.tsx:186`
- **Gap:** Phase-3 defect #177: mermaid-rendered SVG is injected via dangerouslySetInnerHTML without passing through sanitizeSvg. The only mermaid test asserts the loading/fallback/ready state - it never injects a malicious mermaid diagram nor asserts the rendered SVG is sanitized before DOM insertion.
- **Fix:** Add a test that renders a mermaid artifact whose diagram produces script/on-handler SVG and assert no executable markup reaches the DOM (sanitizeSvg applied).

### No prompt-injection containment test for room-message->agent prompt (runtime.ts:311)
- **Location:** `packages/plugin-copilot/tests/runtime.test.ts:97`
- **Gap:** Phase-3 defect #218: untrusted room broadcast text is concatenated directly into the agent prompt. No test in the package (grep: zero injection/jailbreak cases) feeds a hostile message (e.g. ignore previous instructions / fake system role) and asserts it is contained, escaped, or delimited. Injection containment is entirely unverified.
- **Fix:** Add a test broadcasting a malicious instruction payload and assert the runtime escapes/delimits untrusted content (e.g. captured agent opts show the user text inside a fenced/role-isolated boundary, not raw concatenation).

### Budget TOCTOU / idle-trigger double-spend bypass untested (runtime.ts:145)
- **Location:** `packages/plugin-copilot/tests/runtime.test.ts:177`
- **Gap:** Phase-3 defect #219: idle-trigger runAgent bypasses the per-copilot serialization queue and can double-spend budget. The budget test only covers the broadcast path; T2.1 serialization is also broadcast-only. No test drives the presence:idle scheduleIdleCheck->runAgent path concurrently with a broadcast to prove budget is charged at most once. Single-threaded queue test cannot prove the idle path is gated.
- **Fix:** Add a test that activates a copilot with a presence:idle trigger + tight perRequest budget, fires an idle check concurrently with a broadcast, and asserts budget preflight runs once and no double-charge / no queue bypass occurs.

### ensureYjs check-then-act race (duplicate/orphaned Y.Doc) untested (yjs-provider.ts:148)
- **Location:** `packages/plugin-realtime/tests/yjs-provider.test.ts:51`
- **Gap:** Phase-3 defect #193: concurrent joinRoom on the same fresh room can create and orphan a duplicate Y.Doc. The multi-room isolation test creates Docs sequentially; the yjs-awareness-convergence Promise.all runs on a room both clients already joined (awareness convergence, not room creation). No test issues two concurrent joinRoom on the SAME un-created room and asserts a single shared Y.Doc. Also untested: applyYjsUpdate against a destroyed Doc after await (yjs-provider.ts:253-257).
- **Fix:** Add a test: Promise.all([joinRoom(room,c1), joinRoom(room,c2)]) on a fresh room id and assert both connections share one Y.Doc (e.g. an update from c1 is visible to c2; getPresence merges). Add a test applying an update after leaveRoom GCs the Doc and assert it does not throw/apply to a destroyed Doc.

### server-integration abort/cleanup + connection-handle leak has NO test file (server-integration.ts:209/187)
- **Location:** `packages/plugin-realtime/src/internal/server-integration.ts:1`
- **Gap:** Phase-3 defect #195/#198: missed abort + unbounded queue leak a connection handle, and onFrame enqueues frames after abort/stop. server-integration.ts (7KB) is referenced only in a COMMENT in presence-multi-client.test.ts and has no dedicated test. The abort/cleanup/backpressure path - the exact concurrency defect - is completely unexercised.
- **Fix:** Add a dedicated server-integration test: simulate a client that aborts mid-stream and assert (a) the connection handle is released, (b) onFrame stops enqueuing after abort, (c) the queue does not grow unbounded.

### STT/TTS upstream fetch timeout/abort untested (stt-server.ts:105 / tts-server.ts:96)
- **Location:** `packages/plugin-voice/tests/stt-server.test.ts:111`
- **Gap:** Phase-3 defects #211/#212: neither STT nor TTS handler applies an upstream timeout/abort, so a hung provider hangs the request indefinitely. Both test files inject fetchImpl and cover 401/5xx/network/parse mapping but NEVER simulate a slow/hanging upstream nor assert init.signal (AbortController) is passed or a timeout fires. The unbounded-hang defect is invisible to the suite.
- **Fix:** Add tests with a fetchImpl that never resolves (or resolves after a fake-timer advance) and assert the handler aborts/times out with a 504/UPSTREAM_TIMEOUT and that init.signal was provided. Mirror for tts-server including streamed-body cancellation on abort.

## MEDIUM (4)

### TheoForm test exercises a duplicated copy of catch-block logic, not the real component
- **Location:** `packages/plugin-forms/tests/unit/TheoForm.test.tsx:20`
- **Gap:** TheoForm.test.tsx defines a local extractFieldsFromError (lines 20-25) and a local simulateHandleValidCatch (lines 62-73) that MIRROR TheoForm.tsx:186-191 and 113-129, then tests the mirror. The real <TheoForm> component is never mounted. The error-routing-vs-rethrow contract (ActionInputError -> setError; arbitrary error -> rethrow) is correctness relevant (a swallowed non-field error hides failures). If TheoForm.tsx drifts from this inline copy, tests stay green while production regresses. Coverage of the actual unit is illusory.
- **Fix:** Mount <TheoForm> with a mocked useAction and assert the real handleValid catch path routes field errors to RHF setError and re-throws non-field errors. If mounting is infeasible, extract handleValid logic into an exported pure function and import it into the test so prod and test share one source.

### renderReactEmail happy path untested; assertion coupled to a dependency being ABSENT
- **Location:** `packages/plugin-email/tests/render-react-email.test.ts:13`
- **Gap:** render-react-email.test.ts only asserts the function exists and throws when @react-email/render is NOT installed. The success path (rendering a React email to HTML) has zero coverage. The negative test depends on the optional dep being absent in the environment; if @react-email/render becomes transitively available the assertion silently inverts and the test breaks for the wrong reason. The rendering behavior shipped to users is unverified.
- **Fix:** Add a happy-path test that injects a stub renderer (or adds @react-email/render as a devDependency) and asserts renderReactEmail returns the expected HTML. Decouple the missing-dep test from the global environment by mocking the dynamic import to reject.

### MediaRecorder error DURING recording (stream leak) untested (recorder.ts:135)
- **Location:** `packages/plugin-voice/tests/recorder.test.ts:217`
- **Gap:** Phase-3 defect #213: a MediaRecorder error event during recording is dropped and the media stream is leaked. The existing error test emits the error only AFTER stop() is called (error-during-stop). No test fires an error event while state===recording and asserts the recorder transitions to error AND stops the stream tracks (no leak).
- **Fix:** Add a test: start(), emitError(...) while recording (before stop), assert recorder surfaces a typed error AND that stream getTracks().stop() was called (no leak).

### use-tts stale audio.play() race after newer speak()/stop() untested (use-tts.ts:184)
- **Location:** `packages/plugin-voice/tests/use-tts.test.tsx:164`
- **Gap:** Phase-3 defect #216: an older audio.play() resolving after a newer speak()/stop() can clobber phase state. stop()->idle is tested for a single call only; no overlapping speak() race test exists.
- **Fix:** Add a test issuing speak(A) then speak(B) (or speak then stop) with controllable play() resolution, resolve the older play last, and assert phase reflects B / idle - not the stale A.

