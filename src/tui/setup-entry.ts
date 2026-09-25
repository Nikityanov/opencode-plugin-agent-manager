import { getOhMyConfigLayer, readConfig, setOpenCodeAgentModels, writeConfig } from "../config"
import type { ConfigLocation, ConfigSection, ModelOption } from "../types"
import type { TuiApi } from "./model-options"
import { applyModelToOhMyTargets } from "./operations"
import { handleOpenCodeStatusCommand } from "./opencode"
import { runSetupFlow } from "./setup-flows"
import { collectOhMySetupTargets, collectOpenCodeSetupTargets, targetIdToTarget } from "./setup-targets"
import type { SetupApplyRequest, SetupScope, SetupSection } from "./setup-state"
import type { SetupTargets } from "./setup-targets"
import { handleStatusCommand } from "./status"

/**
 * The two public doors into the setup wizard, one per scope.
 *
 * Everything scope-specific lives here: which targets exist, what the hub's
 * review shortcut opens, and the one persistence call Apply performs. The wizard
 * itself is scope-agnostic and lives in `./setup-flows`, which is handed a
 * `SetupFlow` describing the scope instead of branching on it.
 *
 * Nothing here writes before Apply: `collect` only reads, and `apply` is the
 * single writer per scope.
 */

export type SetupFlow = {
  readonly scope: SetupScope
  readonly title: string
  readonly sections: readonly SetupSection[]
  readonly models: readonly ModelOption[]
  /** Reads the target list. Must not write. */
  readonly collect: () => SetupTargets
  /** Opens the read-only assignment view the hub's review row delegates to. */
  readonly showAssignments: () => void
  /** The one writer. Runs once per Apply. */
  readonly apply: (request: SetupApplyRequest) => void
}

export function openOpenCodeSetup(
  api: TuiApi,
  openCodeConfigPath: string,
  models: readonly ModelOption[],
): void {
  runSetupFlow(api, {
    scope: "opencode",
    title: "OpenCode agents setup",
    sections: ["agents"],
    models,
    collect: () => collectOpenCodeSetupTargets(openCodeConfigPath, api.state.config.agent),
    showAssignments: () => handleOpenCodeStatusCommand(api, openCodeConfigPath),
    apply: (request) =>
      setOpenCodeAgentModels(
        openCodeConfigPath,
        request.targetIds.map((id) => targetIdToTarget(id).key),
        request.model,
      ),
  })
}

export function openOhMySetup(
  api: TuiApi,
  configLocation: ConfigLocation,
  models: readonly ModelOption[],
): void {
  const section: ConfigSection = configLocation.section ?? "root"
  runSetupFlow(api, {
    scope: "oh-my",
    title: "Oh My OpenAgent setup",
    sections: ["agents", "categories"],
    models,
    collect: () => collectOhMySetupTargets(readConfig(configLocation.path), section),
    showAssignments: () => handleStatusCommand(api, configLocation),
    apply: (request) => {
      const config = readConfig(configLocation.path)
      const layer = getOhMyConfigLayer(config, section)
      applyModelToOhMyTargets(layer, request.targetIds.map(targetIdToTarget), request.model)
      writeConfig(configLocation.path, config, section)
    },
  })
}
