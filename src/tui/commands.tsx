/** @jsxImportSource @opentui/solid */

import type { ConfigLocation, ModelOption } from "../types"
import { handleOhMyBulkCommand, handleOpenCodeBulkCommand } from "./bulk"
import { handleConfigCommand } from "./ohmy-commands"
import { handleOpenCodeConfigCommand, handleOpenCodeStatusCommand } from "./opencode"
import { getModelOptions, type TuiApi } from "./model-options"
import { showError } from "./notifications"
import { handleStatusCommand } from "./status"

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
          handleOpenCodeStatusCommand(api, openCodeConfigPath)
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
