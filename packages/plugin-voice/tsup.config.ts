import { defineConfig } from 'tsup'

// Two entry points so the server-side plugin and the UI components live in
// separate dist trees and consumers can `import "@usetheo/plugin-voice"`
// (server) vs `import "@usetheo/plugin-voice/ui"` (browser-only) without
// pulling React into a Node-only deployment.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'ui/index': 'src/ui/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom'],
})
