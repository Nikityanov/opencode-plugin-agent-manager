/** @jsxImportSource @opentui/solid */

import { ensureOhMyConfigLayer, getOhMyConfigLayer, readConfig, writeConfig } from "../config"
import type {
  ConfigLocation,
  ConfigSection,
  ModelAssignment,
  ModelOption,
  OhMyOpenAgentConfig,
} from "../types"
import { showError } from "./notifications"
import type { TuiApi } from "./model-options"
import { readPinnedModels, toModelPickerOptions } from "./pinned-models"

export type Target =
  | { readonly kind: "agent"; readonly key: string }
  | { readonly kind: "category"; readonly key: string }

const DEFAULT_AGENT_NAMES = [
  "sisyphus",
  "hephaestus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "prometheus",
  "metis",
  "momus",
  "atlas",
  "sisyphus-junior",
] as const

const DEFAULT_CATEGORY_NAMES = [
  "visual-engineering",
  "ultrabrain",
  "deep",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
] as const

export function getOhMyTargets(
  config: OhMyOpenAgentConfig,
  section: ConfigSection,
  includeBuiltIns = section === "opencode",
): Target[] {
  const layer = getOhMyConfigLayer(config, section)
  const agentNames = new Set([
    ...Object.keys(layer.agents ?? {}),
    ...(includeBuiltIns ? DEFAULT_AGENT_NAMES : []),
  ])
  const categoryNames = new Set([
    ...Object.keys(layer.categories ?? {}),
    ...(includeBuiltIns ? DEFAULT_CATEGORY_NAMES : []),
  ])

  return [
    ...[...agentNames].map((key) => ({ kind: "agent" as const, key })),
    ...[...categoryNames].map((key) => ({ kind: "category" as const, key })),
  ]
}

function targetTitle(target: Target): string {
  return `${target.kind}: ${target.key}`
}

function getSection(
  config: OhMyOpenAgentConfig,
  section: ConfigSection,
  kind: Target["kind"],
): Record<string, ModelAssignment> {
  const layer = ensureOhMyConfigLayer(config, section)
  if (kind === "agent") {
    layer.agents ??= {}
    return layer.agents
  }

  layer.categories ??= {}
  return layer.categories
}

function getAssignment(
  config: OhMyOpenAgentConfig,
  section: ConfigSection,
  target: Target,
): ModelAssignment {
  return getSection(config, section, target.kind)[target.key] ?? {}
}

/** Sentinel row that removes a model override instead of writing one. */
const CLEAR_OVERRIDE_OPTION = "__clear__"

function openModelSelector(
  api: TuiApi,
  configLocation: ConfigLocation,
  config: OhMyOpenAgentConfig,
  models: ModelOption[],
  target: Target,
): void {
  const section = configLocation.section ?? "root"
  const current = getAssignment(config, section, target).model
  const modelOptions = toModelPickerOptions(
    models.map((model) => ({
      ...model,
      title: `${model.title}${model.value === current ? " (current)" : ""}`,
    })),
    readPinnedModels(api),
    [{ title: "Clear model override", value: CLEAR_OVERRIDE_OPTION }],
  )

  api.ui.dialog.replace(() => {
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
  })
  api.ui.dialog.setSize("large")
}

function applyChange(
  api: TuiApi,
  configLocation: ConfigLocation,
  config: OhMyOpenAgentConfig,
  models: ModelOption[],
  target: Target,
  selected: string,
): void {
  const section = configLocation.section ?? "root"
  const assignment = getAssignment(config, section, target)

  if (selected === CLEAR_OVERRIDE_OPTION) {
    delete assignment.model
  } else {
    assignment.model = selected
  }

  getSection(config, section, target.kind)[target.key] = assignment
  writeConfig(configLocation.path, config, section)

  const selectedTitle = models.find((model) => model.value === selected)?.title ?? selected
  api.ui.toast({
    variant: "success",
    title: "Saved",
    message: `${targetTitle(target)} → ${selected === CLEAR_OVERRIDE_OPTION ? "cleared" : selectedTitle}`,
    duration: 2000,
  })
}

export function handleConfigCommand(
  api: TuiApi,
  configLocation: ConfigLocation,
  models: ModelOption[],
): void {
  const config = readConfig(configLocation.path)
  const targets = getOhMyTargets(config, configLocation.section ?? "root")

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
      message: "No agents or categories found in the active oh-my configuration",
      duration: 3000,
    })
    return
  }

  api.ui.dialog.replace(() => {
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
  })
  api.ui.dialog.setSize("medium")
}
