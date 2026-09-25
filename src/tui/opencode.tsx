/** @jsxImportSource @opentui/solid */

import { setOpenCodeAgentModels } from "../config"
import type { ModelOption } from "../types"
import { selectModel } from "./bulk"
import type { TuiApi } from "./model-options"
import { showError } from "./notifications"

function getAgentNames(api: TuiApi): string[] {
  return Object.keys(api.state.config.agent ?? {})
}

function showWarning(api: TuiApi, message: string): void {
  api.ui.toast({
    variant: "warning",
    title: "Agent Model Manager",
    message,
    duration: 3000,
  })
}

function openAgentModelPicker(
  api: TuiApi,
  configPath: string,
  models: readonly ModelOption[],
  agentName: string,
): void {
  const current = api.state.config.agent?.[agentName]?.model
  const options = models.map((model) => ({
    ...model,
    title: `${model.title}${model.value === current ? " (current)" : ""}`,
  }))

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect
    return (
      <DialogSelect<string>
        title={`Select model for OpenCode agent ${agentName}`}
        options={options}
        onSelect={(option) => {
          api.ui.dialog.clear()
          try {
            setOpenCodeAgentModels(configPath, [agentName], option.value)
            api.ui.toast({
              variant: "success",
              title: "OpenCode agent updated",
              message: `${agentName} → ${option.value}`,
              duration: 2000,
            })
          } catch (error) {
            showError(api, error)
          }
        }}
      />
    )
  })
}

export function handleOpenCodeConfigCommand(
  api: TuiApi,
  configPath: string,
  models: readonly ModelOption[],
): void {
  if (models.length === 0) {
    showWarning(api, "No models found in the OpenCode configuration")
    return
  }

  const agentNames = getAgentNames(api)
  if (agentNames.length === 0) {
    showWarning(api, "No OpenCode agents found in the active configuration")
    return
  }

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect
    return (
      <DialogSelect<string>
        title="Configure OpenCode agent model..."
        options={agentNames.map((name) => ({ title: name, value: name }))}
        onSelect={(option) => {
          api.ui.dialog.clear()
          openAgentModelPicker(api, configPath, models, option.value)
        }}
      />
    )
  })
}

export function handleOpenCodeStatusCommand(api: TuiApi): void {
  const entries = Object.entries(api.state.config.agent ?? {})
  if (entries.length === 0) {
    showWarning(api, "No OpenCode agents found in the active configuration")
    return
  }

  const lines = ["OpenCode agent models:", ""]
  for (const [name, agent] of entries) {
    lines.push(`  ${name}: ${agent?.model ?? "(inherited/default)"}`)
  }

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => {
    const DialogAlert = api.ui.DialogAlert
    return (
      <DialogAlert
        title="OpenCode Model Assignments"
        message={lines.join("\n")}
        onConfirm={() => api.ui.dialog.clear()}
      />
    )
  })
}
