import type { TuiDialogSelectOption, TuiKV } from "@opencode-ai/plugin/tui"
import type { ModelOption } from "../types"
import type { TuiApi } from "./model-options"

/**
 * Pinned models, persisted in the host's own plugin key-value store.
 *
 * The model picker is the hot path of this plugin: it is re-entered on every
 * assignment, over every model of every configured provider, and a person
 * assigns the same handful of models over and over. A pin list shortens that
 * walk far more than any amount of scrolling.
 *
 * State goes to `api.kv` and never into a target configuration. The plugin's
 * only write to a user's files is a model assignment, and a pin list is a
 * preference of the picker, not configuration an agent depends on - so it must
 * not travel with the config, must not be diffed by reviewers, and must not
 * change when the config is edited by hand.
 */

const STORAGE_KEY = "agent-model-manager.pinned-models"

/** Group header for the pinned rows, so they are visibly a separate set. */
export const PINNED_CATEGORY = "Pinned"

/**
 * The store, but only once it can be trusted. Readiness is checked here rather
 * than at each call site because a write to a store that cannot be read would
 * replace the real pin list with a one-entry list built from an empty read.
 */
function openStore(api: TuiApi): TuiKV | undefined {
  const store: TuiKV | undefined = api.kv
  return store !== undefined && store.ready ? store : undefined
}

/**
 * `api.kv` hands back `unknown`: the value can be anything a previous version,
 * another tool, or a hand-edited state file left there. Anything that is not a
 * list of non-empty strings is discarded rather than trusted, so a corrupt
 * store can only ever cost the user their pin list, never break the picker.
 */
export function readPinnedModels(api: TuiApi): string[] {
  const store = openStore(api)
  if (store === undefined) return []

  const raw: unknown = store.get<unknown>(STORAGE_KEY, [])
  if (!Array.isArray(raw)) return []

  const pinned: string[] = []
  for (const entry of raw) {
    if (typeof entry !== "string") continue
    const value = entry.trim()
    if (value.length > 0 && !pinned.includes(value)) pinned.push(value)
  }
  return pinned
}

/** Flips one model's pinned state and persists the result. Returns the new state. */
export function togglePinnedModel(api: TuiApi, model: string): boolean {
  const store = openStore(api)
  const value = model.trim()
  if (store === undefined || value.length === 0) return false

  const pinned = readPinnedModels(api)
  const next = pinned.includes(value)
    ? pinned.filter((entry) => entry !== value)
    : [...pinned, value]
  store.set(STORAGE_KEY, next)
  return next.includes(value)
}

/**
 * The one place picker rows are built, so every picker orders models the same
 * way: pinned models first under the `Pinned` group, then every other model in
 * its original order. The group follows the model list rather than the order
 * things were pinned, so pinning one more model never reshuffles the ones
 * already in it. A pinned model is moved rather than repeated, so it has
 * exactly one row and one meaning. `trailing` carries rows that are not models
 * (the wizard's `Back`, the legacy `Clear model override`) and always stays
 * last, below every group.
 */
export function toModelPickerOptions(
  models: readonly ModelOption[],
  pinned: readonly string[],
  trailing: readonly TuiDialogSelectOption<string>[] = [],
): TuiDialogSelectOption<string>[] {
  const pinnedSet = new Set(pinned)
  const head: TuiDialogSelectOption<string>[] = []
  const tail: TuiDialogSelectOption<string>[] = []

  for (const model of models) {
    if (pinnedSet.has(model.value)) {
      head.push({ title: model.title, value: model.value, category: PINNED_CATEGORY })
    } else {
      tail.push({ title: model.title, value: model.value })
    }
  }

  return [...head, ...tail, ...trailing]
}
