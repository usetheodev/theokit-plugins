/**
 * Fixture (T3.1) — minimal TheoKit app demonstrating @usetheo/plugin-cors
 * wired into theo.config.ts > plugins[].
 *
 * Cross-repo workspace per ADR D7 (theokit available via `link:` in plugin
 * devDependencies).
 */
import { defineConfig } from 'theokit'
import corsPlugin from '../../../src/index.js'

export default defineConfig({
  plugins: [
    corsPlugin({
      origin: ['https://allowed.example.com'],
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  ],
})
