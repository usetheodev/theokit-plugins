# SEPA pre-RED — iter 1 — T1.1 (F-wire-1)
Design correct: pass {onError: surface} to createRecorder + widen recorderFactory to (opts?)=>Recorder.
[CRITICAL notes are pre-existing/verify-tsc, NOT blockers]: recorder cached in recorderRef (onError baked at first-create — same constraint as fetchImpl, no new regression); () => rec stays assignable to (opts?)=>Recorder (structural typing). RED genuine: pre-fix createRecorder() called w/ no args → captured onError undefined → assertion fails. Scope: voice-recorder-bar.tsx + test only; recorder.ts unchanged.
