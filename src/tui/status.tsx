/** @jsxImportSource @opentui/solid */

import { getOhMyConfigLayer, readConfig } from "../config"
import type { ConfigLocation, ModelAssignment } from "../types"
import type { TuiApi } from "./model-options"
import { getOhMyTargets } from "./ohmy-commands"
import { showScrollableStatus } from "./status-dialog"

function formatAssignment(assignment: ModelAssignment): string {
  return assignment.model ?? "(inherited)"
}

export function handleStatusCommand(api: TuiApi, configLocation: ConfigLocation): void {
  const config = readConfig(configLocation.path)
  const section = configLocation.section ?? "root"
  const layer = getOhMyConfigLayer(config, section)
  const targets = getOhMyTargets(config, section)
  const lines = ["Current oh-my model assignments:", "", "Agents:"]
  const agents = targets.filter((target) => target.kind === "agent")

  if (agents.length === 0) {
    lines.push("  (none)")
  } else {
    for (const target of agents) {
      lines.push(`  ${target.key}: ${formatAssignment(layer.agents?.[target.key] ?? {})}`)
    }
  }

  lines.push("", "Categories:")
  const categories = targets.filter((target) => target.kind === "category")
  if (categories.length === 0) {
    lines.push("  (none)")
  } else {
    for (const target of categories) {
      lines.push(`  ${target.key}: ${formatAssignment(layer.categories?.[target.key] ?? {})}`)
    }
  }

  showScrollableStatus(api, "Oh-my Model Assignments", lines)
}
