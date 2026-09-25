import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import type { ModelOption } from "../types"

export type TuiApi = Parameters<TuiPlugin>[0]

export function getModelOptions(api: TuiApi): ModelOption[] {
  const options = new Map<string, ModelOption>()

  for (const [providerId, provider] of Object.entries(api.state.config.provider ?? {})) {
    for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
      const modelId = model.id ?? modelKey
      const value = `${providerId}/${modelId}`
      const providerName = provider.name ?? provider.id ?? providerId
      options.set(value, {
        value,
        title: `${providerName} / ${model.name ?? modelId}`,
      })
    }
  }

  if (options.size > 0) return [...options.values()]

  for (const provider of api.state.provider ?? []) {
    for (const [modelKey, model] of Object.entries(provider.models)) {
      const modelId = model.id ?? modelKey
      const value = `${provider.id}/${modelId}`
      options.set(value, {
        value,
        title: `${provider.name} / ${model.name}`,
      })
    }
  }

  return [...options.values()]
}
