import { getOhMyConfigLayer, readOpenCodeAgentModels } from "../config"
import type { ConfigSection, ModelAssignment, OhMyConfigLayer, OhMyOpenAgentConfig } from "../types"
import { getOhMyTargets, type Target } from "./ohmy-commands"
import { createSetupTarget, type TargetId, type TargetInput, type TargetKind } from "./setup-state"

const AGENT_PREFIX = "agent:"
const CATEGORY_PREFIX = "category:"

/** The single field of an `api.state.config.agent` entry the wizard reads. */
export type StateAgentEntry = {
  readonly model?: string
}

/**
 * Everything the setup wizard needs about one scope: the target list, the model
 * each target already carries, and the targets that only inherit a model.
 *
 * Both lookups are keyed by `TargetId` rather than by target key because one
 * config file may name an agent and a category identically.
 */
export type SetupTargets = {
  readonly targets: readonly TargetInput[]
  readonly currentModels: ReadonlyMap<TargetId, string>
  readonly inheritedIds: ReadonlySet<TargetId>
}

function isAgentTargetId(id: TargetId): id is `agent:${string}` {
  return id.startsWith(AGENT_PREFIX)
}

/**
 * Turns a wizard target id back into the oh-my target shape the writer needs.
 *
 * Only the known `agent:` prefix is sliced off, because agent and category keys
 * may themselves contain `:`.
 */
export function targetIdToTarget(id: TargetId): Target {
  if (isAgentTargetId(id)) {
    return { kind: "agent", key: id.slice(AGENT_PREFIX.length) }
  }
  return { kind: "category", key: id.slice(CATEGORY_PREFIX.length) }
}

function readAssignment(layer: OhMyConfigLayer, kind: TargetKind, key: string): string | undefined {
  const entries: Readonly<Record<string, ModelAssignment>> =
    kind === "agent" ? (layer.agents ?? {}) : (layer.categories ?? {})
  return entries[key]?.model
}

export function collectOhMySetupTargets(
  config: OhMyOpenAgentConfig,
  section: ConfigSection,
): SetupTargets {
  const layer = getOhMyConfigLayer(config, section)
  const targets: TargetInput[] = []
  const currentModels = new Map<TargetId, string>()
  const inheritedIds = new Set<TargetId>()

  for (const target of getOhMyTargets(config, section)) {
    const setupTarget = createSetupTarget(target.kind, target.key)
    targets.push(setupTarget)
    const model = readAssignment(layer, target.kind, target.key)
    if (model === undefined) {
      inheritedIds.add(setupTarget.id)
      continue
    }
    currentModels.set(setupTarget.id, model)
  }

  return { targets, currentModels, inheritedIds }
}

/**
 * Collects the OpenCode agent scope: the union of the agents present in the
 * resolved host state and the agents already persisted in the config file.
 * A persisted model wins over the in-state value, which may be stale.
 */
export function collectOpenCodeSetupTargets(
  configPath: string,
  stateAgents: Readonly<Record<string, StateAgentEntry | undefined>> | undefined,
): SetupTargets {
  const persisted = readOpenCodeAgentModels(configPath)
  const names = new Set([...Object.keys(stateAgents ?? {}), ...Object.keys(persisted)])
  const targets: TargetInput[] = []
  const currentModels = new Map<TargetId, string>()
  const inheritedIds = new Set<TargetId>()

  for (const name of names) {
    const setupTarget = createSetupTarget("agent", name)
    targets.push(setupTarget)
    const model = persisted[name] ?? stateAgents?.[name]?.model
    if (model === undefined) {
      inheritedIds.add(setupTarget.id)
      continue
    }
    currentModels.set(setupTarget.id, model)
  }

  return { targets, currentModels, inheritedIds }
}
