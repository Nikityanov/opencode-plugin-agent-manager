import type { OhMyOpenAgentConfig } from "../types"

export function applyModelToOhMyEntries(config: OhMyOpenAgentConfig, model: string): number {
  let count = 0
  for (const section of [config.agents, config.categories]) {
    if (!section) continue
    for (const key of Object.keys(section)) {
      section[key] = { ...section[key], model }
      count += 1
    }
  }
  return count
}
