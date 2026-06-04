import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "@theokit/sdk",
    "theokit",
    "@theokit/auth-google",
    "@theokit/auth-github",
    "@theokit/auth-magic-link",
  ],
});
