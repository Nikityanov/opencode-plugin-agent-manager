/** @jsxImportSource @opentui/solid */

import type { ModelOption } from "../types"
import type { TuiApi } from "./model-options"
import { PINNED_CATEGORY, readPinnedModels, toModelPickerOptions, togglePinnedModel } from "./pinned-models"

/**
 * `/amm-pin` - flip a model's pinned state.
 *
 * The wizard's own model step is a host `DialogSelect`, which exposes no key
 * hook, so a pin cannot be toggled from inside it. Toggling therefore lives in
 * its own picker, and the wizard only reads the result.
 *
 * The dialog stays open after a toggle instead of closing: pinning three models
 * is one visit, not three, and each toggle is confirmed in place by its row
 * changing group and label. That is also why there is no toast - a toast would
 * land on top of the open modal and duplicate what the row already says.
 */
export function handlePinCommand(api: TuiApi, models: readonly ModelOption[]): void {
  if (models.length === 0) {
    api.ui.toast({
      variant: "warning",
      title: "Agent Model Manager",
      message: "No models found in the OpenCode configuration",
      duration: 3000,
    })
    return
  }

  function render(): void {
    const pinned = readPinnedModels(api)
    const pinnedSet = new Set(pinned)
    const options = toModelPickerOptions(models, pinned).map((option) => ({
      ...option,
      description: pinnedSet.has(option.value) ? `In ${PINNED_CATEGORY} · Enter to unpin` : "Enter to pin",
    }))

    // `replace` renders inside the host's DialogProvider, so the element has to
    // be built by the thunk; `setSize` always follows `replace` because the host
    // resets the size on every replace.
    api.ui.dialog.replace(() => {
      const DialogSelect = api.ui.DialogSelect
      return (
        <DialogSelect<string>
          title="Pin or unpin a model"
          options={options}
          onSelect={(option) => {
            togglePinnedModel(api, option.value)
            render()
          }}
        />
      )
    })
    api.ui.dialog.setSize("large")
  }

  render()
}
