import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  ohMyOpenAgentConfigSchema,
  type ConfigLocation,
  type OhMyOpenAgentConfig,
} from "./types"

const CONFIG_FILENAMES = ["oh-my-openagent.json", "oh-my-openagent.jsonc"] as const
const OPEN_CODE_CONFIG_FILENAMES = ["opencode.jsonc", "opencode.json", "config.json"] as const
const MAX_PARENT_LEVELS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function resolveOpenCodeConfigPath(pathOrDirectory: string): string {
  if (!isDirectory(pathOrDirectory)) return pathOrDirectory

  for (const filename of OPEN_CODE_CONFIG_FILENAMES) {
    const candidate = join(pathOrDirectory, filename)
    if (existsSync(candidate)) return candidate
  }

  return join(pathOrDirectory, "opencode.jsonc")
}

function parseJsoncText(text: string, path: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const parsed: unknown = parseJsonc(text, errors, {
    allowTrailingComma: true,
  })

  if (errors.length > 0 || !isRecord(parsed)) {
    throw new Error(`Invalid JSON object in ${path}`)
  }

  return parsed
}

function parseJsoncObject(path: string): Record<string, unknown> {
  return parseJsoncText(readFileSync(path, "utf-8"), path)
}

function readConfigFile(path: string): OhMyOpenAgentConfig {
  return ohMyOpenAgentConfigSchema.parse(parseJsoncObject(path))
}

function findExistingConfig(startDir: string): ConfigLocation | null {
  const visited = new Set<string>()
  let current = startDir

  for (let level = 0; level < MAX_PARENT_LEVELS; level += 1) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = join(current, filename)
      if (visited.has(candidate)) continue
      visited.add(candidate)

      if (existsSync(candidate)) {
        return { path: candidate, config: readConfigFile(candidate) }
      }
    }

    const parent = join(current, "..")
    if (parent === current) break
    current = parent
  }

  const globalDirectory = join(homedir(), ".config", "opencode")
  for (const filename of CONFIG_FILENAMES) {
    const candidate = join(globalDirectory, filename)
    if (visited.has(candidate) || !existsSync(candidate)) continue
    return { path: candidate, config: readConfigFile(candidate) }
  }

  return null
}

export function findConfig(startDir: string): ConfigLocation | null {
  return findExistingConfig(startDir)
}

export function readConfig(absolutePath: string): OhMyOpenAgentConfig {
  return readConfigFile(absolutePath)
}

export function writeConfig(absolutePath: string, config: OhMyOpenAgentConfig): void {
  writeFileSync(absolutePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8")
}

export function getConfigurableKeys(config: OhMyOpenAgentConfig): string[] {
  return [...Object.keys(config.agents ?? {}), ...Object.keys(config.categories ?? {})]
}

export function setOpenCodeAgentModels(
  pathOrDirectory: string,
  agentNames: readonly string[],
  model: string,
): number {
  const names = [...new Set(agentNames)]
  if (names.length === 0) return 0

  const configPath = resolveOpenCodeConfigPath(pathOrDirectory)
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "{}\n"
  const config = parseJsoncText(raw, configPath)
  const existingAgents = isRecord(config.agent) ? config.agent : {}
  const missingNames = names.filter((name) => !isRecord(existingAgents[name]))

  if (missingNames.length === 0) {
    let updated = raw
    for (const name of names) {
      const edits = modify(updated, ["agent", name, "model"], model, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      })
      updated = applyEdits(updated, edits)
    }
    writeFileSync(configPath, updated.endsWith("\n") ? updated : `${updated}\n`, "utf-8")
    return names.length
  }

  const nextAgents: Record<string, unknown> = { ...existingAgents }
  for (const name of names) {
    const current = nextAgents[name]
    nextAgents[name] = {
      ...(isRecord(current) ? current : {}),
      model,
    }
  }

  const edits = modify(raw, ["agent"], nextAgents, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  })
  const updated = applyEdits(raw, edits)
  writeFileSync(configPath, updated.endsWith("\n") ? updated : `${updated}\n`, "utf-8")
  return names.length
}
