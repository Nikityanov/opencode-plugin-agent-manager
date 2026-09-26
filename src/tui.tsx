/** @jsxImportSource @opentui/solid */

import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { findConfig } from "./config"
import { registerModelManagerCommands } from "./tui/commands"
import { resolvePluginVersion } from "./version"

const PLUGIN_ID = "agent-model-manager" as const
type TuiApi = Parameters<TuiPlugin>[0]

function isOhMyOpenAgentInstalled(api: TuiApi): boolean {
  return (api.state.config.plugin ?? []).some((entry) => {
    const spec = Array.isArray(entry) ? entry[0] : entry
    return (
      typeof spec === "string" &&
      (spec === "oh-my-openagent" ||
        spec.startsWith("oh-my-openagent@") ||
        spec === "oh-my-opencode" ||
        spec.startsWith("oh-my-opencode@"))
    )
  })
}

const tui: TuiPlugin = async (api, _options, meta) => {
  const projectDir = api.state.path.directory || process.cwd()
  const configLocation = findConfig(projectDir)
  const ohMyAvailable = configLocation !== null && isOhMyOpenAgentInstalled(api)
  const version = resolvePluginVersion(meta.version)
  registerModelManagerCommands(
    api,
    ohMyAvailable ? configLocation : null,
    api.state.path.config,
  )
  api.ui.toast({
    variant: ohMyAvailable ? "success" : "info",
    title: "Agent Model Manager",
    message: ohMyAvailable
      ? `Loaded v${version}`
      : `Loaded v${version}; oh-my-openagent is unavailable`,
    duration: 2000,
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin
