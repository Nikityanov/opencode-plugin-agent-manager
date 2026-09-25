/** @jsxImportSource @opentui/solid */

import { readConfig } from "../config"
import type { ConfigLocation, ModelAssignment } from "../types"
import type { TuiApi } from "./model-options"

function formatAssignment(assignment: ModelAssignment): string {
  return assignment.model ?? "(inherited)"
}

export function handleStatusCommand(api: TuiApi, configLocation: ConfigLocation): void {
  const config = readConfig(configLocation.path)
  const lines = ["Current oh-my model assignments:", "", "Agents:"]
  const agents = Object.entries(config.agents ?? {})

  if (agents.length === 0) {
    lines.push("  (none)")
  } else {
    for (const [name, assignment] of agents) {
      lines.push(`  ${name}: ${formatAssignment(assignment)}`)
    }
  }

  lines.push("", "Categories:")
  const categories = Object.entries(config.categories ?? {})
  if (categories.length === 0) {
    lines.push("  (none)")
  } else {
    for (const [name, assignment] of categories) {
      lines.push(`  ${name}: ${formatAssignment(assignment)}`)
    }
  }

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => {
    const DialogAlert = api.ui.DialogAlert
    return (
      <DialogAlert
        title="Oh-my Model Assignments"
        message={lines.join("\n")}
        onConfirm={() => api.ui.dialog.clear()}
      />
    )
  })
}
