import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    // Environment is set per-file via `@vitest-environment jsdom` so the
    // server-side tests (stt/tts/scaffold) keep running under the cheap
    // Node environment and only the React tests pay the jsdom cost.
    environment: 'node',
  },
})
