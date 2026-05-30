/**
 * Browser-only UI subpath for @usetheo/plugin-voice.
 *
 * 0.4.0 (T3.4): ships `<VoiceRecorderBar>` + `<TalkOptions>` ready to
 * drop into `ChatComposer.leadingActions`. The `<VoiceAlert>` primitive
 * is exported so apps that wrap the bar with a custom layout can reuse
 * the same error surface.
 *
 * 0.2.0 (T3.2): `createRecorder` factory + typed errors for apps
 * building a fully custom voice UI.
 */
export {
  VoiceRecorderBar,
  type VoiceRecorderBarProps,
  type RecorderBarPhase,
} from './voice-recorder-bar.js'

export {
  TalkOptions,
  type TalkOptionsProps,
  type TalkOptionsValue,
  type TtsVoice,
  type TtsSpeed,
  TALK_OPTION_VOICES,
  TALK_OPTION_SPEEDS,
} from './talk-options.js'

export {
  useTts,
  type UseTtsOptions,
  type UseTtsPhase,
  type UseTtsSpeakOptions,
  type UseTtsState,
} from './use-tts.js'

export { VoiceAlert, type VoiceAlertProps, type AlertKind } from './alert.js'

export {
  createRecorder,
  type CreateRecorderOptions,
  type Recorder,
  type RecorderState,
} from '../recorder.js'

export {
  VoiceNoDeviceError,
  VoicePermissionDeniedError,
  VoicePluginConfigError,
  VoicePluginError,
  VoiceProviderError,
} from '../errors.js'

export type { VoiceConfig, VoiceOptions, ResolvedVoiceOptions } from '../options.js'
