/**
 * Universal types for oh-my-openagent.json configuration.
 * These are inferred from the file, not hardcoded.
 */

/** A provider entry in oh-my-openagent.json */
export interface ProviderEntry {
  /** Provider display name */
  name: string
  /** Provider identifier (e.g. "openrouter", "openai") */
  id: string
  /** Available models from this provider */
  models: ModelEntry[]
}

/** A model entry under a provider */
export interface ModelEntry {
  /** Model ID (e.g. "anthropic/claude-sonnet-4") */
  id: string
  /** Display name */
  name: string
}

/** Agent or category assignment */
export interface ModelAssignment {
  /** Which provider this model belongs to */
  providerId: string
  /** The model ID within the provider */
  modelId: string
}

/** The root structure of oh-my-openagent.json */
export interface OhMyOpenAgentConfig {
  /** Available providers and their models */
  providers?: Record<string, ProviderEntry>
  /** Per-agent model assignments */
  agents?: Record<string, ModelAssignment>
  /** Per-category model assignments */
  categories?: Record<string, ModelAssignment>
  /** Default/fallback model */
  fallback_model?: ModelAssignment
}

/** Discovered config location */
export interface ConfigLocation {
  /** Absolute path to oh-my-openagent.json */
  path: string
  /** The parsed config */
  config: OhMyOpenAgentConfig
}
