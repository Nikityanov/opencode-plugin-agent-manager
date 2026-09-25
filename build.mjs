import { mkdir } from "node:fs/promises"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

await mkdir("dist", { recursive: true })

await build({
  entryPoints: ["src/tui.tsx"],
  outfile: "dist/tui.js",
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: true,
  external: ["@opencode-ai/*", "@opentui/*", "solid-js", "jsonc-parser", "zod"],
  plugins: [
    solidPlugin({
      solid: {
        moduleName: "@opentui/solid",
        generate: "universal",
      },
    }),
  ],
})

await build({
  entryPoints: ["src/config.ts"],
  outfile: "dist/config.js",
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: true,
  external: ["jsonc-parser", "zod"],
})

await build({
  entryPoints: ["src/tui/operations.ts"],
  outfile: "dist/operations.js",
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: true,
})
