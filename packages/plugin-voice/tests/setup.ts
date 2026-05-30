import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library does not auto-clean under Vitest unless we run
// it explicitly between tests — without this, every render() stays in
// the same JSDOM document and `getByTestId` returns "multiple elements".
afterEach(() => {
  cleanup()
})

// jsdom does not implement URL.createObjectURL / revokeObjectURL — the
// `useTts` hook builds object URLs from the audio Blob to feed
// HTMLAudioElement. The polyfill below is a deterministic counter so
// tests can assert `audio.src` matches `/^blob:/` without binding to a
// specific real-world URL shape.
let __blobCounter = 0
if (typeof URL.createObjectURL !== 'function') {
  ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
    __blobCounter += 1
    return `blob:mock://${__blobCounter}`
  }
}
if (typeof URL.revokeObjectURL !== 'function') {
  ;(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined
}
