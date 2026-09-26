/** @jsxImportSource @opentui/solid */

import { readOpenCodeAgentModels, setOpenCodeAgentModels } from "../config"
import type { ModelOption } from "../types"
import { selectModel } from "./bulk"
import type { TuiApi } from "./model-options"
import { showError } from "./notifications"
import { readPinnedModels, toModelPickerOptions } from "./pinned-models"
import { showScrollableStatus } from "./status-dialog"

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
  const options = toModelPickerOptions(
    models.map((model) => ({
      ...model,
      title: `${model.title}${model.value === current ? " (current)" : ""}`,
    })),
    readPinnedModels(api),
  )

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
  api.ui.dialog.setSize("large")
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
  api.ui.dialog.setSize("medium")
}

export function handleOpenCodeStatusCommand(api: TuiApi, configPath: string): void {
  const stateAgents = api.state.config.agent ?? {}
  const persistedModels = readOpenCodeAgentModels(configPath)
  const names = [...new Set([...Object.keys(stateAgents), ...Object.keys(persistedModels)])]

  if (names.length === 0) {
    showWarning(api, "No OpenCode agents found in the active configuration")
    return
  }

  const lines = ["OpenCode agent models:", ""]
  for (const name of names) {
    const model = persistedModels[name] ?? stateAgents[name]?.model
    lines.push(`  ${name}: ${model ?? "(inherited/default)"}`)
  }

  showScrollableStatus(api, "OpenCode Model Assignments", lines)
}
