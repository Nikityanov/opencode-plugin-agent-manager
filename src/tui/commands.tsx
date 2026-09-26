/** @jsxImportSource @opentui/solid */

import type { ConfigLocation, ModelOption } from "../types"
import { handleOhMyBulkCommand, handleOpenCodeBulkCommand } from "./bulk"
import { getModelOptions, type TuiApi } from "./model-options"
import { showError } from "./notifications"
import { handleConfigCommand } from "./ohmy-commands"
import { handleOpenCodeConfigCommand, handleOpenCodeStatusCommand } from "./opencode"
import { handlePinCommand } from "./pin-command"
import { openOhMySetup, openOpenCodeSetup } from "./setup-entry"
import { handleStatusCommand } from "./status"

/**
 * The palette exposes exactly two visible rows, one per scope, and both open the
 * same hierarchical setup wizard. Every pre-existing handler stays registered so
 * no slash name breaks: the two superseded per-target wizards lose their
 * `slashName` (their names now live in the new rows' `slashAliases`), and the
 * legacy bulk/status rows keep their slash names but are hidden from the palette.
 */

const CATEGORY = "Agent Model Manager"

function guard(api: TuiApi, run: () => void): () => void {
  return () => {
    try {
      run()
    } catch (error) {
      showError(api, error)
    }
  }
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
          name: "amm-ohmy-setup",
          title: "Oh My OpenAgent setup",
          category: CATEGORY,
          namespace: "palette" as const,
          slashName: "amm-ohmy-setup",
          slashAliases: ["amm", "model-config", "agent-config"],
          suggested: true,
          run: guard(api, () => openOhMySetup(api, configLocation, models)),
        },
        {
          name: "amm",
          title: "Configure oh-my agent/category models",
          category: CATEGORY,
          namespace: "palette" as const,
          hidden: true,
          run: guard(api, () => handleConfigCommand(api, configLocation, models)),
        },
        {
          name: "amm-all-ohmy",
          title: "Set one model for all oh-my agents/categories",
          category: CATEGORY,
          namespace: "palette" as const,
          slashName: "amm-all-ohmy",
          hidden: true,
          run: guard(api, () => handleOhMyBulkCommand(api, configLocation, models)),
        },
        {
          name: "amm-status",
          title: "Show oh-my model assignments",
          category: CATEGORY,
          namespace: "palette" as const,
          slashName: "amm-status",
          hidden: true,
          run: guard(api, () => handleStatusCommand(api, configLocation)),
        },
      ]
    : []

  const openCodeCommands = [
    {
      name: "amm-opencode-setup",
      title: "OpenCode agents setup",
      category: CATEGORY,
      namespace: "palette" as const,
      slashName: "amm-opencode-setup",
      slashAliases: ["amm-opencode"],
      suggested: true,
      run: guard(api, () => openOpenCodeSetup(api, openCodeConfigPath, models)),
    },
    {
      name: "amm-opencode",
      title: "Configure an OpenCode agent model",
      category: CATEGORY,
      namespace: "palette" as const,
      hidden: true,
      run: guard(api, () => handleOpenCodeConfigCommand(api, openCodeConfigPath, models)),
    },
    {
      name: "amm-opencode-all",
      title: "Set one model for all OpenCode agents",
      category: CATEGORY,
      namespace: "palette" as const,
      slashName: "amm-opencode-all",
      hidden: true,
      run: guard(api, () => handleOpenCodeBulkCommand(api, openCodeConfigPath, models)),
    },
    {
      name: "amm-opencode-status",
      title: "Show OpenCode agent models",
      category: CATEGORY,
      namespace: "palette" as const,
      slashName: "amm-opencode-status",
      hidden: true,
      run: guard(api, () => handleOpenCodeStatusCommand(api, openCodeConfigPath)),
    },
  ]

  const commands = [
    ...ohMyCommands,
    ...openCodeCommands,
    {
      name: "amm-pin",
      title: "Pin or unpin a model",
      category: CATEGORY,
      namespace: "palette" as const,
      slashName: "amm-pin",
      hidden: true,
      run: guard(api, () => handlePinCommand(api, models)),
    },
  ]
  const primaryCommand = configLocation ? "amm-ohmy-setup" : "amm-opencode-setup"

  // The commands and the shortcut live in two separate layers, mirroring the
  // host's own split in `app.tsx`. The command layer must stay mode-less: the
  // command palette is itself a dialog, so opening it pushes the host's "modal"
  // mode, and a `mode: "base"` command layer would go inactive exactly when the
  // palette is asking for its rows. The binding layer is the one that gets
  // `mode: "base"`, so Ctrl+Shift+M cannot re-enter while a modal is already open.
  const disposeCommands = api.keymap.registerLayer({ commands })
  const disposeBinding = api.keymap.registerLayer({
    mode: "base",
    bindings: [{ key: "ctrl+shift+m", cmd: primaryCommand, desc: "Configure models" }],
  })

  for (const dispose of [disposeCommands, disposeBinding]) {
    if (typeof dispose === "function") api.lifecycle.onDispose(dispose)
  }
}
