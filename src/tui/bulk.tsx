/** @jsxImportSource @opentui/solid */

import { readConfig, setOpenCodeAgentModels, writeConfig } from "../config"
import type { ConfigLocation, ModelOption } from "../types"
import type { TuiApi } from "./model-options"
import { showError } from "./notifications"
import { applyModelToOhMyEntries } from "./operations"

export function selectModel(
  api: TuiApi,
  title: string,
  models: readonly ModelOption[],
  onSelect: (model: string) => void,
): void {
  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => {
    const DialogSelect = api.ui.DialogSelect
    return (
      <DialogSelect<string>
        title={title}
        options={models.map((model) => ({ title: model.title, value: model.value }))}
        onSelect={(option) => {
          api.ui.dialog.clear()
          onSelect(option.value)
        }}
      />
    )
  })
}

export function confirmBulk(
  api: TuiApi,
  title: string,
  message: string,
  onConfirm: () => void,
): void {
  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(() => {
    const DialogConfirm = api.ui.DialogConfirm
    return (
      <DialogConfirm
        title={title}
        message={message}
        onConfirm={() => {
          api.ui.dialog.clear()
          onConfirm()
        }}
        onCancel={() => api.ui.dialog.clear()}
      />
    )
  })
}

export function handleOhMyBulkCommand(
  api: TuiApi,
  configLocation: ConfigLocation,
  models: readonly ModelOption[],
): void {
  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3000,
    })
    return
  }

  const config = readConfig(configLocation.path)
  const count =
    Object.keys(config.agents ?? {}).length + Object.keys(config.categories ?? {}).length
  if (count === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No oh-my agents or categories found",
      duration: 3000,
    })
    return
  }

  selectModel(api, "Apply one model to all oh-my entries", models, (model) => {
    confirmBulk(
      api,
      "Apply model everywhere?",
      `Set ${model} for ${count} oh-my agents/categories?`,
      () => {
        try {
          applyModelToOhMyEntries(config, model)
          writeConfig(configLocation.path, config)
          api.ui.toast({
            variant: "success",
            title: "Oh-my agents updated",
            message: `${model} applied to ${count} entries`,
            duration: 2500,
          })
        } catch (error) {
          showError(api, error)
        }
      },
    )
  })
}

export function handleOpenCodeBulkCommand(
  api: TuiApi,
  configPath: string,
  models: readonly ModelOption[],
): void {
  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3000,
    })
    return
  }

  const agentNames = Object.keys(api.state.config.agent ?? {})
  if (agentNames.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No OpenCode agents found in the active configuration",
      duration: 3000,
    })
    return
  }

  selectModel(api, "Apply one model to all OpenCode agents", models, (model) => {
    confirmBulk(
      api,
      "Apply model to OpenCode agents?",
      `Set ${model} for ${agentNames.length} OpenCode agents, including built-ins?`,
      () => {
        try {
          const count = setOpenCodeAgentModels(configPath, agentNames, model)
          api.ui.toast({
            variant: "success",
            title: "OpenCode agents updated",
            message: `${model} applied to ${count} agents`,
            duration: 2500,
          })
        } catch (error) {
          showError(api, error)
        }
      },
    )
  })
}
