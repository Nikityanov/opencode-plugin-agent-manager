/** @jsxImportSource @opentui/solid */

import { readConfig, writeConfig } from "../config"
import type { ConfigLocation, ModelAssignment, ModelOption, OhMyOpenAgentConfig } from "../types"
import { handleOhMyBulkCommand, handleOpenCodeBulkCommand } from "./bulk"
import { handleOpenCodeConfigCommand, handleOpenCodeStatusCommand } from "./opencode"
import { getModelOptions, type TuiApi } from "./model-options"
import { showError } from "./notifications"
import { handleStatusCommand } from "./status"

type Target = {
  readonly kind: "agent" | "category"
  readonly key: string
}

function getTargets(config: OhMyOpenAgentConfig): Target[] {
  const agentTargets: Target[] = Object.keys(config.agents ?? {}).map((key) => ({
    kind: "agent",
    key,
  }))
  const categoryTargets: Target[] = Object.keys(config.categories ?? {}).map((key) => ({
    kind: "category",
    key,
  }))
  return [...agentTargets, ...categoryTargets]
}

function targetTitle(target: Target): string {
  return `${target.kind}: ${target.key}`
}

function getSection(
  config: OhMyOpenAgentConfig,
  kind: Target["kind"],
): Record<string, ModelAssignment> {
  if (kind === "agent") {
    config.agents ??= {}
    return config.agents
  }

  config.categories ??= {}
  return config.categories
}

function getAssignment(config: OhMyOpenAgentConfig, target: Target): ModelAssignment {
  return getSection(config, target.kind)[target.key] ?? {}
}

function openModelSelector(
  api: TuiApi,
  configLocation: ConfigLocation,
  config: OhMyOpenAgentConfig,
  models: ModelOption[],
  target: Target,
): void {
  const current = getAssignment(config, target).model
  const modelOptions: ModelOption[] = [
    ...models.map((model) => ({
      ...model,
      title: `${model.title}${model.value === current ? " (current)" : ""}`,
    })),
    { value: "__clear__", title: "Clear model override" },
  ]

  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(
    () => {
      const DialogSelect = api.ui.DialogSelect
      return (
        <DialogSelect<string>
          title={`Select model for ${target.key}`}
          options={modelOptions}
          onSelect={(option) => {
            api.ui.dialog.clear()
            try {
              applyChange(api, configLocation, config, models, target, option.value)
            } catch (error) {
              showError(api, error)
            }
          }}
        />
      )
    },
  )
}

function applyChange(
  api: TuiApi,
  configLocation: ConfigLocation,
  config: OhMyOpenAgentConfig,
  models: ModelOption[],
  target: Target,
  selected: string,
): void {
  const assignment = getAssignment(config, target)

  if (selected === "__clear__") {
    delete assignment.model
  } else {
    assignment.model = selected
  }

  getSection(config, target.kind)[target.key] = assignment
  writeConfig(configLocation.path, config)

  const selectedTitle = models.find((model) => model.value === selected)?.title ?? selected
  api.ui.toast({
    variant: "success",
    title: "Saved",
    message: `${targetTitle(target)} → ${selected === "__clear__" ? "cleared" : selectedTitle}`,
    duration: 2000,
  })
}

function handleConfigCommand(
  api: TuiApi,
  configLocation: ConfigLocation,
  models: ModelOption[],
): void {
  const config = readConfig(configLocation.path)
  const targets = getTargets(config)

  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3000,
    })
    return
  }

  if (targets.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No agents or categories found in oh-my-openagent.json",
      duration: 3000,
    })
    return
  }

  api.ui.dialog.setSize("medium")
  api.ui.dialog.replace(
    () => {
      const DialogSelect = api.ui.DialogSelect
      return (
        <DialogSelect
          title="Configure model for..."
          options={targets.map((target) => ({ title: targetTitle(target), value: target }))}
          onSelect={(option) => {
            api.ui.dialog.clear()
            openModelSelector(api, configLocation, config, models, option.value)
          }}
        />
      )
    },
  )
}

export function registerModelManagerCommands(
  api: TuiApi,
  configLocation: ConfigLocation | null,
  openCodeConfigPath: string,
): void {
  const models = getModelOptions(api)
  const ohMyCommands = configLocation
    ? [
        {
          name: "amm",
          title: "Configure oh-my agent/category models",
          category: "Agent Model Manager",
          namespace: "palette" as const,
          slashName: "amm",
          suggested: true,
          run: () => {
            try {
              handleConfigCommand(api, configLocation, models)
            } catch (error) {
              showError(api, error)
            }
          },
        },
        {
          name: "amm-all-ohmy",
          title: "Set one model for all oh-my agents/categories",
          category: "Agent Model Manager",
          namespace: "palette" as const,
          slashName: "amm-all-ohmy",
          suggested: true,
          run: () => {
            try {
              handleOhMyBulkCommand(api, configLocation, models)
            } catch (error) {
              showError(api, error)
            }
          },
        },
        {
          name: "amm-status",
          title: "Show oh-my model assignments",
          category: "Agent Model Manager",
          namespace: "palette" as const,
          slashName: "amm-status",
          run: () => {
            try {
              handleStatusCommand(api, configLocation)
            } catch (error) {
              showError(api, error)
            }
          },
        },
      ]
    : []

  const commands = [
    ...ohMyCommands,
    {
      name: "amm-opencode",
      title: "Configure an OpenCode agent model",
      category: "Agent Model Manager",
      namespace: "palette" as const,
      slashName: "amm-opencode",
      suggested: true,
      run: () => {
        try {
          handleOpenCodeConfigCommand(api, openCodeConfigPath, models)
        } catch (error) {
          showError(api, error)
        }
      },
    },
    {
      name: "amm-opencode-all",
      title: "Set one model for all OpenCode agents",
      category: "Agent Model Manager",
      namespace: "palette" as const,
      slashName: "amm-opencode-all",
      suggested: true,
      run: () => {
        try {
          handleOpenCodeBulkCommand(api, openCodeConfigPath, models)
        } catch (error) {
          showError(api, error)
        }
      },
    },
    {
      name: "amm-opencode-status",
      title: "Show OpenCode agent models",
      category: "Agent Model Manager",
      namespace: "palette" as const,
      slashName: "amm-opencode-status",
      run: () => {
        try {
          handleOpenCodeStatusCommand(api)
        } catch (error) {
          showError(api, error)
        }
      },
    },
  ]

  const primaryCommand = configLocation ? "amm" : "amm-opencode"
  const dispose = api.keymap.registerLayer({
    commands,
    bindings: [{ key: "ctrl+shift+m", cmd: primaryCommand, desc: "Configure models" }],
  })

  if (typeof dispose === "function") api.lifecycle.onDispose(dispose)
}
