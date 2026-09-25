import { mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

const projectRoot = dirname(fileURLToPath(import.meta.url))
const distDirectory = join(projectRoot, "dist")

await rm(distDirectory, { recursive: true, force: true })
await mkdir(distDirectory, { recursive: true })

await build({
  entryPoints: [join(projectRoot, "src/tui.tsx")],
  outfile: join(distDirectory, "tui.js"),
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
  entryPoints: [join(projectRoot, "src/config.ts")],
  outfile: join(distDirectory, "config.js"),
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: true,
  external: ["jsonc-parser", "zod"],
})

await build({
  entryPoints: [join(projectRoot, "src/tui/operations.ts")],
  outfile: join(distDirectory, "operations.js"),
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: true,
})
