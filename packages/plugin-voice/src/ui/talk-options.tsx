/**
 * `<TalkOptions>` — controlled selector for TTS voice + playback speed.
 *
 * Designed to live alongside `<VoiceRecorderBar>` in
 * `ChatComposer.leadingActions` (e.g. via a small toolbar wrapping both)
 * or inside a pop-over triggered from `<VoiceRecorderBar>`.
 *
 * Voice enum mirrors the server-side `VALID_VOICES` source of truth in
 * `options.ts` (#215) — keeping them in sync is a deliberate duplication
 * (DRY across the network boundary loses to type safety on both ends).
 * If the server adds a voice, update `options.ts` first, then this enum.
 *
 * Speed is bounded [0.25, 4.0] per OpenAI tts-1 docs. The selector
 * exposes the four canonical multipliers users actually want (0.75,
 * 1.0, 1.25, 1.5) so we don't ship a noisy slider.
 *
 * Controlled component — `value` + `onChange` only, no internal state,
 * so the consumer keeps a single source of truth (typically the chat
 * session settings).
 */

import { useId } from 'react'

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
export type TtsSpeed = 0.75 | 1 | 1.25 | 1.5

const VOICES: readonly TtsVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
const SPEEDS: readonly TtsSpeed[] = [0.75, 1, 1.25, 1.5]

export interface TalkOptionsValue {
  voice: TtsVoice
  speed: TtsSpeed
}

export interface TalkOptionsProps {
  value: TalkOptionsValue
  onChange: (next: TalkOptionsValue) => void
  className?: string
  /** Hide the speed control. Defaults to false. */
  hideSpeed?: boolean
}

export function TalkOptions({ value, onChange, className, hideSpeed = false }: TalkOptionsProps) {
  const voiceId = useId()
  const speedId = useId()

  return (
    <div
      data-testid="talk-options"
      className={['inline-flex items-center gap-3', className].filter(Boolean).join(' ')}
    >
      <label className="flex items-center gap-1.5 text-xs font-medium" htmlFor={voiceId}>
        <span className="text-muted-foreground">Voice</span>
        <select
          id={voiceId}
          data-testid="talk-options-voice"
          value={value.voice}
          onChange={(e) => onChange({ ...value, voice: e.target.value as TtsVoice })}
          className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs"
        >
          {VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {hideSpeed ? null : (
        <label className="flex items-center gap-1.5 text-xs font-medium" htmlFor={speedId}>
          <span className="text-muted-foreground">Speed</span>
          <select
            id={speedId}
            data-testid="talk-options-speed"
            value={String(value.speed)}
            onChange={(e) => onChange({ ...value, speed: Number(e.target.value) as TtsSpeed })}
            className="rounded-md border border-border/60 bg-card px-2 py-1 text-xs"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s.toString()}x
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

export { VOICES as TALK_OPTION_VOICES, SPEEDS as TALK_OPTION_SPEEDS }
