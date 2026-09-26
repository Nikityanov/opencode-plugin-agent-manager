import { readFileSync } from "node:fs"

/**
 * Own-package version lookup.
 *
 * The host passes `meta.version` to the TUI plugin, but it only records it for
 * npm-installed plugins. A `file://` or absolute-path spec — the documented way
 * to run a local checkout — is stored with no version at all, so relying on
 * `meta.version` alone would report `unknown` for exactly the install most
 * developers are iterating on. The bundled `dist/tui.js` always sits one
 * directory below the package root, so the shipped `package.json` is the
 * authoritative source in every install mode.
 */
const PACKAGE_MANIFEST_URL = new URL("../package.json", import.meta.url)

const UNKNOWN_VERSION = "unknown"

function normalizeVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readManifestVersion(): string | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(PACKAGE_MANIFEST_URL, "utf-8"))
    if (typeof manifest !== "object" || manifest === null) return undefined
    return normalizeVersion((manifest as { version?: unknown }).version)
  } catch {
    return undefined
  }
}

/**
 * Resolves the version of the loaded plugin, preferring the host-reported value
 * and falling back to the package manifest this bundle was built from.
 */
export function resolvePluginVersion(metaVersion?: string): string {
  return normalizeVersion(metaVersion) ?? readManifestVersion() ?? UNKNOWN_VERSION
}
