/**
 * CLI/TUI plugin — adds slash commands and dialog UI for configuring
 * agent/category model assignments in oh-my-openagent.json.
 *
 * This plugin is UNIVERSAL: it reads the config file dynamically,
 * no hardcoded agents or categories.
 */

import { Plugin } from "@opencode/plugin/tui"
import { findConfig, readConfig, writeConfig, getAllModels } from "./config"
import type { OhMyOpenAgentConfig, ModelAssignment } from "./types"

export default Plugin.define({
  id: "opencode-agent-model-manager",
  setup(context) {
    const location = context.location ?? context.data.location.default()
    const projectDir = location?.directory ?? process.cwd()

    // Find oh-my-openagent.json
    const configLocation = findConfig(projectDir)

    if (!configLocation) {
      context.ui.toast.show({
        message: "oh-my-openagent.json not found",
        variant: "error",
        duration: 3000,
      })
      return
    }

    // Register slash command: /amm (agent model manager)
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "opencode-agent-model-manager.config",
          title: "Configure agent/category models",
          group: "Agent Model Manager",
          palette: true,
          slash: {
            name: "amm",
            aliases: ["model-config", "agent-config"],
            arguments: true,
          },
          enabled: () => true,
          suggested: true,
          run: async (input) => {
            try {
              await handleConfigCommand(context, configLocation.path)
            } catch (err) {
              context.ui.toast.show({
                title: "Error",
                message: err instanceof Error ? err.message : String(err),
                variant: "error",
                duration: 5000,
              })
            }
          },
        },
      ],
      bindings: ["opencode-agent-model-manager.config"],
    }))

    // Register /amm-status to show current config summary
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "opencode-agent-model-manager.status",
          title: "Show current model assignments",
          group: "Agent Model Manager",
          palette: true,
          slash: {
            name: "amm-status",
            aliases: [],
            arguments: false,
          },
          enabled: () => true,
          run: async () => {
            try {
              await handleStatusCommand(context, configLocation.path)
            } catch (err) {
              context.ui.toast.show({
                title: "Error",
                message: err instanceof Error ? err.message : String(err),
                variant: "error",
                duration: 5000,
              })
            }
          },
        },
      ],
      bindings: ["opencode-agent-model-manager.status"],
    }))

    context.ui.toast.show({
      message: `Agent Model Manager loaded (${configLocation.path})`,
      variant: "success",
      duration: 2000,
    })
  },
})

// ─── Command Handlers ───────────────────────────────────────────────

async function handleConfigCommand(
  context: Parameters<Parameters<typeof Plugin.define>["0"]["setup"]>[0],
  configPath: string,
) {
  const config = readConfig(configPath)
  const models = getAllModels(config)

  if (models.length === 0) {
    context.ui.toast.show({
      message: "No providers/models found in oh-my-openagent.json",
      variant: "warning",
      duration: 3000,
    })
    return
  }

  // Step 1: Choose what to configure
  const targets: string[] = []
  if (config.agents) targets.push(...Object.keys(config.agents).map((k) => `agent: ${k}`))
  if (config.categories) targets.push(...Object.keys(config.categories).map((k) => `category: ${k}`))

  if (targets.length === 0) {
    context.ui.toast.show({
      message: "No agents or categories found to configure",
      variant: "warning",
      duration: 3000,
    })
    return
  }

  const target = await context.ui.dialog.select({
    title: "Configure model for...",
    options: targets.map((t) => ({ title: t, value: t })),
  })

  if (!target) return // User cancelled

  // Parse target type and key
  const [type, ...keyParts] = target.split(": ")
  const key = keyParts.join(": ")

  // Step 2: Get current assignment
  const section = type === "agent" ? config.agents : config.categories
  const current = section?.[key]
  const currentValue = current ? `${current.providerId}/${current.modelId}` : undefined

  // Step 3: Build model options
  const modelOptions = models.map((m) => ({
    title: `${m.providerName} / ${m.modelName}`,
    value: `${m.providerId}/${m.modelId}`,
    description: m.modelId === current?.modelId ? "(current)" : undefined,
  }))

  // Step 4: Add option to clear assignment
  modelOptions.push({ title: "Clear (remove assignment)", value: "__clear__", description: "Remove this override" })

  const selected = await context.ui.dialog.select({
    title: `Select model for ${key}`,
    current: currentValue,
    options: modelOptions,
  })

  if (!selected) return // User cancelled

  // Step 5: Apply change
  if (selected === "__clear__") {
    delete section?.[key]
  } else {
    const [providerId, modelId] = selected.split("/")
    if (!section) {
      if (type === "agent") config.agents = {}
      else config.categories = {}
    }
    const targetSection = type === "agent" ? config.agents! : config.categories!
    targetSection[key] = { providerId, modelId }
  }

  // Step 6: Write back
  writeConfig(configPath, config)

  context.ui.toast.show({
    title: "Saved",
    message: `${key} → ${selected === "__clear__" ? "cleared" : selected}`,
    variant: "success",
    duration: 2000,
  })
}

async function handleStatusCommand(
  context: Parameters<Parameters<typeof Plugin.define>["0"]["setup"]>[0],
  configPath: string,
) {
  const config = readConfig(configPath)
  const lines: string[] = []

  lines.push("Current model assignments:")
  lines.push("")

  if (config.agents && Object.keys(config.agents).length > 0) {
    lines.push("Agents:")
    for (const [name, assignment] of Object.entries(config.agents)) {
      lines.push(`  ${name}: ${assignment.providerId}/${assignment.modelId}`)
    }
  } else {
    lines.push("Agents: (none)")
  }

  lines.push("")

  if (config.categories && Object.keys(config.categories).length > 0) {
    lines.push("Categories:")
    for (const [name, assignment] of Object.entries(config.categories)) {
      lines.push(`  ${name}: ${assignment.providerId}/${assignment.modelId}`)
    }
  } else {
    lines.push("Categories: (none)")
  }

  if (config.fallback_model) {
    lines.push("")
    lines.push(`Fallback: ${config.fallback_model.providerId}/${config.fallback_model.modelId}`)
  }

  // Show as toast (limited), or we could use a dialog
  const message = lines.join("\n")

  await context.ui.dialog.alert({
    title: "Model Assignments",
    message,
  })
}
