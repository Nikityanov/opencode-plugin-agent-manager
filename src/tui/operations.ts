import type { ModelAssignment, OhMyConfigLayer } from "../types"
import type { Target } from "./ohmy-commands"

export function applyModelToOhMyEntries(config: OhMyConfigLayer, model: string): number {
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

/**
 * Applies one model to the given oh-my targets only, creating missing entries.
 *
 * Mutates the layer in place so `writeConfig` can diff it against the file and
 * keep comments plus unrelated fields. Existing `fallback_models` and any other
 * assignment fields survive because the previous entry is spread first.
 */
export function applyModelToOhMyTargets(
  layer: OhMyConfigLayer,
  targets: readonly Target[],
  model: string,
): void {
  for (const target of targets) {
    const entries = entriesForTarget(layer, target)
    entries[target.key] = { ...entries[target.key], model }
  }
}

function assertNever(value: never): never {
  return value
}

function entriesForTarget(
  layer: OhMyConfigLayer,
  target: Target,
): Record<string, ModelAssignment> {
  switch (target.kind) {
    case "agent":
      return (layer.agents ??= {})
    case "category":
      return (layer.categories ??= {})
    default:
      return assertNever(target)
  }
}
