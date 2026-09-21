/**
 * Universal config scanner — reads oh-my-openagent.json dynamically.
 * No hardcoded agents or categories; everything is discovered from the file.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import type { OhMyOpenAgentConfig, ConfigLocation } from "./types"

const CONFIG_FILENAME = "oh-my-openagent.json"

/**
 * Find oh-my-openagent.json by walking up from the given directory.
 * Searches:
 *   1. directory/CONFIG_FILENAME
 *   2. directory/../CONFIG_FILENAME
 *   3. Up to 5 parent levels
 */
export function findConfig(startDir: string): ConfigLocation | null {
  let current = startDir
  for (let i = 0; i < 5; i++) {
    const candidate = join(current, CONFIG_FILENAME)
    if (existsSync(candidate)) {
      const raw = readFileSync(candidate, "utf-8")
      const config = JSON.parse(raw) as OhMyOpenAgentConfig
      return { path: candidate, config }
    }
    const parent = join(current, "..")
    if (parent === current) break
    current = parent
  }
  return null
}

/**
 * Read the config from a known absolute path.
 */
export function readConfig(absolutePath: string): OhMyOpenAgentConfig {
  const raw = readFileSync(absolutePath, "utf-8")
  return JSON.parse(raw) as OhMyOpenAgentConfig
}

/**
 * Write config back to disk, preserving structure.
 */
export function writeConfig(absolutePath: string, config: OhMyOpenAgentConfig): void {
  writeFileSync(absolutePath, JSON.stringify(config, null, 2), "utf-8")
}

/**
 * Get all available models from all providers as a flat list.
 */
export function getAllModels(config: OhMyOpenAgentConfig): Array<{
  providerId: string
  providerName: string
  modelId: string
  modelName: string
}> {
  const result: Array<{
    providerId: string
    providerName: string
    modelId: string
    modelName: string
  }> = []

  if (!config.providers) return result

  for (const [providerId, provider] of Object.entries(config.providers)) {
    for (const model of provider.models) {
      result.push({
        providerId,
        providerName: provider.name,
        modelId: model.id,
        modelName: model.name,
      })
    }
  }

  return result
}

/**
 * Get all configurable keys (agents + categories) from config.
 */
export function getConfigurableKeys(config: OhMyOpenAgentConfig): string[] {
  const keys: string[] = []
  if (config.agents) keys.push(...Object.keys(config.agents))
  if (config.categories) keys.push(...Object.keys(config.categories))
  return keys
}
