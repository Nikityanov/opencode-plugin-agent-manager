import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser"
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import {
  ohMyOpenAgentConfigSchema,
  type ConfigLocation,
  type ConfigSection,
  type OhMyConfigLayer,
  type OhMyOpenAgentConfig,
} from "./types"

const LEGACY_CONFIG_FILENAMES = ["oh-my-openagent.json", "oh-my-openagent.jsonc"] as const
const OMO_CONFIG_FILENAMES = ["omo.jsonc", "omo.json"] as const
const OPEN_CODE_CONFIG_FILENAMES = ["opencode.jsonc", "opencode.json", "config.json"] as const

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

export function getOhMyConfigLayer(
  config: OhMyOpenAgentConfig,
  section: ConfigSection,
): OhMyConfigLayer {
  if (section === "root") return config
  return config["[opencode]"] ?? {}
}

export function ensureOhMyConfigLayer(
  config: OhMyOpenAgentConfig,
  section: ConfigSection,
): OhMyConfigLayer {
  if (section === "root") return config

  const existing = config["[opencode]"]
  if (existing) return existing

  const created: OhMyConfigLayer = {}
  config["[opencode]"] = created
  return created
}

function findExistingInDirectory(
  directory: string,
  filenames: readonly string[],
): string | null {
  for (const filename of filenames) {
    const candidate = join(directory, filename)
    if (existsSync(candidate)) return candidate
  }
  return null
}

function findProjectConfigPath(
  startDir: string,
  configDirectory: string | null,
  filenames: readonly string[],
): string | null {
  let current = resolve(startDir)
  const home = resolve(homedir())

  while (true) {
    const directory = configDirectory ? join(current, configDirectory) : current
    const candidate = findExistingInDirectory(directory, filenames)
    if (candidate) return candidate
    if (current === home) return null

    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readLocation(path: string): ConfigLocation {
  const config = readConfigFile(path)
  const section: ConfigSection = isRecord(config["[opencode]"]) ? "opencode" : "root"
  return { path, config, section }
}

function findExistingConfig(startDir: string): ConfigLocation | null {
  const projectModern = findProjectConfigPath(startDir, ".omo", OMO_CONFIG_FILENAMES)
  if (projectModern) return readLocation(projectModern)

  const home = resolve(homedir())
  const userModern = findExistingInDirectory(join(home, ".omo"), OMO_CONFIG_FILENAMES)
  if (userModern) return readLocation(userModern)

  const projectLegacy = findProjectConfigPath(startDir, null, LEGACY_CONFIG_FILENAMES)
  if (projectLegacy) return readLocation(projectLegacy)

  const userLegacy = findExistingInDirectory(
    join(home, ".config", "opencode"),
    LEGACY_CONFIG_FILENAMES,
  )
  return userLegacy ? readLocation(userLegacy) : null
}

export function findConfig(startDir: string): ConfigLocation | null {
  return findExistingConfig(startDir)
}

export function readConfig(absolutePath: string): OhMyOpenAgentConfig {
  return readConfigFile(absolutePath)
}

function getModelValue(value: unknown): string | undefined {
  return isRecord(value) && typeof value.model === "string" ? value.model : undefined
}

function getModelMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function getLayerRecord(
  config: Record<string, unknown>,
  section: ConfigSection,
): Record<string, unknown> {
  if (section === "root") return config
  return isRecord(config["[opencode]"]) ? config["[opencode]"] : {}
}

function getModelPath(
  section: ConfigSection,
  kind: "agents" | "categories",
  name: string,
): string[] {
  return [...(section === "opencode" ? ["[opencode]"] : []), kind, name, "model"]
}

export function writeConfig(
  absolutePath: string,
  config: OhMyOpenAgentConfig,
  section: ConfigSection = "root",
): void {
  const raw = readFileSync(absolutePath, "utf-8")
  const original = parseJsoncText(raw, absolutePath)
  const originalLayer = getLayerRecord(original, section)
  const nextLayer = getOhMyConfigLayer(config, section)
  let updated = raw

  for (const kind of ["agents", "categories"] as const) {
    const originalMap = getModelMap(originalLayer[kind])
    const nextMap = getModelMap(nextLayer[kind])
    const names = new Set([...Object.keys(originalMap), ...Object.keys(nextMap)])

    for (const name of names) {
      const originalModel = getModelValue(originalMap[name])
      const nextModel = getModelValue(nextMap[name])
      if (originalModel === nextModel) continue

      const edits = modify(updated, getModelPath(section, kind, name), nextModel, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      })
      updated = applyEdits(updated, edits)
    }
  }

  writeFileSync(absolutePath, updated.endsWith("\n") ? updated : `${updated}\n`, "utf-8")
}

export function getConfigurableKeys(
  config: OhMyOpenAgentConfig,
  section: ConfigSection = "root",
): string[] {
  const layer = getOhMyConfigLayer(config, section)
  return [...Object.keys(layer.agents ?? {}), ...Object.keys(layer.categories ?? {})]
}

export function readOpenCodeAgentModels(
  pathOrDirectory: string,
): Readonly<Record<string, string | undefined>> {
  const configPath = resolveOpenCodeConfigPath(pathOrDirectory)
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "{}\n"
  const config = parseJsoncText(raw, configPath)
  const agents = isRecord(config.agent) ? config.agent : {}
  const models: Record<string, string | undefined> = {}

  for (const [name, value] of Object.entries(agents)) {
    models[name] = isRecord(value) && typeof value.model === "string" ? value.model : undefined
  }

  return models
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
