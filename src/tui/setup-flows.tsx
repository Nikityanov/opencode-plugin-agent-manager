/** @jsxImportSource @opentui/solid */

import type { TuiDialogSelectOption } from "@opencode-ai/plugin/tui"
import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import type { JSX } from "solid-js"
import type { TuiApi } from "./model-options"
import { showError } from "./notifications"
import { readPinnedModels, toModelPickerOptions } from "./pinned-models"
import {
  MODEL_BACK_OPTION,
  hubScreen,
  modelScreen,
  reviewKey,
  reviewScreen,
  targetsKey,
  targetsScreen,
  type HubChoice,
} from "./setup-screens"
import {
  canApply,
  createInitialSetupState,
  setupReducer,
  type SetupAction,
  type SetupState,
} from "./setup-state"
import type { SetupFlow } from "./setup-entry"
import { targetRowId } from "./setup-view"
import { listRows, reviewChromeRows, TARGETS_CHROME_ROWS, valueColumns } from "./viewport"

/**
 * The hierarchical setup wizard: hub -> target checkboxes -> model picker ->
 * review -> apply. One logical screen is visible at a time and every screen is
 * handed to `api.ui.dialog.replace` as raw OpenTUI JSX; `setSize` always follows
 * `replace` because the host resets the size on every replace. Escape, Ctrl+C
 * and Ctrl+Return stay host-owned, and no keymap mode is pushed, so the
 * `ctrl+shift+m` shortcut cannot re-enter an open modal. Configuration is
 * written only from `applySelection`, once per Apply; every earlier phase reads.
 *
 * This module owns the state machine, the dialog and keymap interaction, and the
 * apply error boundary. `./setup-screens` owns the copy and the pure JSX
 * builders, `./setup-state` owns the reducer, `./setup-view` owns the primitives,
 * `./viewport` owns the terminal-height budget, and `./setup-entry` owns the
 * scope-specific data collection and the one persistence call per scope.
 */

function assertNever(value: never): never {
  return value
}

function warn(api: TuiApi, message: string): void {
  api.ui.toast({ variant: "warning", title: "Agent Model Manager", message, duration: 3000 })
}

export function runSetupFlow(api: TuiApi, options: SetupFlow): void {
  const { models, scope, title } = options
  if (models.length === 0) {
    warn(api, "No models found in the OpenCode configuration")
    return
  }

  const data = options.collect()
  if (data.targets.length === 0) {
    warn(api, "No targets found in the active configuration")
    return
  }

  const modelOptions: TuiDialogSelectOption<string>[] = toModelPickerOptions(
    models,
    readPinnedModels(api),
    [{ title: "Back", value: MODEL_BACK_OPTION }],
  )

  let state: SetupState = createInitialSetupState({
    targets: data.targets,
    models: models.map((model) => model.value),
  })
  let pendingRowId: string | null = null
  let reviewError: string | null = null

  /**
   * `replace` renders inside the host's DialogProvider, so the element must be
   * built by the thunk - never by the caller, which would run
   * `createComponent` outside the provider. `setSize` always follows `replace`
   * because the host resets the size on every replace.
   */
  function showDialog(render: () => JSX.Element, size: "medium" | "large"): void {
    api.ui.dialog.replace(render)
    api.ui.dialog.setSize(size)
  }

  /**
   * Every `replace` builds a brand new scrollbox at `scrollTop = 0`, so the
   * previous instance is already detached and a microtask aimed at it can never
   * scroll. The ref callback is the first moment the *live* instance exists, but
   * its rows still have no geometry, and `scrollChildIntoView` measures `y` and
   * `height`. The renderer's frame pump runs queued frame callbacks *before* it
   * recalculates the flexbox, so the scroll waits for one whole frame of it: the
   * first frame lays the new tree out, the second reads the result.
   */
  function onScrollBoxRef(instance: ScrollBoxRenderable): void {
    if (pendingRowId === null) return
    const rowId = pendingRowId
    pendingRowId = null
    requestAnimationFrame(() => {
      requestAnimationFrame(() => instance.scrollChildIntoView(rowId))
    })
  }


  function moveCursor(delta: number): void {
    update({ type: "move-cursor", delta })
  }

  function update(action: SetupAction): void {
    state = setupReducer(state, action)
    render()
  }

  function onHubSelect(choice: HubChoice): void {
    if (choice === "review") {
      api.ui.dialog.clear()
      options.showAssignments()
      return
    }
    state = setupReducer(state, { type: "select-scope", scope })
    state = setupReducer(state, { type: "select-section", section: choice })
    render()
  }

  function onModelSelect(value: string): void {
    update(value === MODEL_BACK_OPTION ? { type: "back" } : { type: "select-model", model: value })
  }

  function onTargetsKeyDown(event: KeyEvent): void {
    if (event.ctrl || event.meta || event.shift) return
    if (state.phase !== "targets") return
    const key = targetsKey({ name: event.name, cursor: state.cursor, count: state.targets.length })
    if (key === null) return
    event.preventDefault()
    if (key.kind === "move") return moveCursor(key.delta)
    if (key.kind === "select") return update(key.action)
    if (key.kind === "back") return update({ type: "back" })
    if (state.selectedTargetIds.length === 0) {
      warn(api, "Select at least one target before continuing")
      return
    }
    update({ type: "continue" })
  }

  function onReviewKeyDown(event: KeyEvent): void {
    if (event.ctrl || event.meta || event.shift) return
    if (state.phase !== "review") return
    const key = reviewKey({
      name: event.name,
      cursor: state.reviewCursor,
      count: state.selectedTargetIds.length,
    })
    if (key === null) return
    event.preventDefault()
    if (key.kind === "move") {
      // Same live-scrollbox path as the targets list, so the review cursor can
      // never end up below the fold of a long selection.
      return update({ type: "move-cursor", delta: key.delta })
    }
    if (key.kind === "back") {
      // Clear a previous apply failure so it cannot survive into the next visit.
      reviewError = null
      return update({ type: "back" })
    }
    applySelection(state)
  }

  function applySelection(current: SetupState): void {
    if (!canApply(current)) return
    const applied = setupReducer(current, { type: "apply" })
    if (applied.phase !== "closed" || applied.request === null) return

    try {
      options.apply(applied.request)
    } catch (error) {
      reviewError = error instanceof Error ? error.message : String(error)
      showError(api, error)
      render()
      return
    }

    const count = applied.request.targetIds.length
    api.ui.dialog.clear()
    api.ui.toast({
      variant: "success",
      title: "Model assignments updated",
      message: `${applied.request.model} applied to ${count} target${count === 1 ? "" : "s"}`,
      duration: 2500,
    })
  }

  /**
   * Records the row that must be visible, then hands the screen to the host.
   * The order matters: `replace` runs the ref callback synchronously while it
   * builds the new tree, so the intent has to be in place *before* the call, and
   * a screen without a list clears it so a stale id cannot leak into the next
   * list screen. Because the intent is recomputed on every rebuild, a cursor
   * stays visible across Back, Continue and selection changes too.
   */
  function render(): void {
    const current = state
    const select = api.ui.DialogSelect
    if (current.phase === "hub") {
      pendingRowId = null
      return showDialog(
        () => hubScreen({ DialogSelect: select, title, sections: options.sections, onSelect: onHubSelect }),
        "medium",
      )
    }
    if (current.phase === "targets") {
      pendingRowId = targetRowId(current.cursor)
      return showDialog(
        () =>
          targetsScreen({
            title,
            scope,
            state: current,
            data,
            listRows: listRows(api, TARGETS_CHROME_ROWS),
            onKeyDown: onTargetsKeyDown,
            onScrollBoxRef,
          }),
        "large",
      )
    }
    if (current.phase === "model") {
      pendingRowId = null
      return showDialog(
        () =>
          modelScreen({
            DialogSelect: select,
            section: current.section,
            options: modelOptions,
            current: current.model,
            onSelect: onModelSelect,
          }),
        "medium",
      )
    }
    if (current.phase === "review") {
      const model = current.model ?? ""
      pendingRowId = targetRowId(current.reviewCursor)
      return showDialog(
        () =>
          reviewScreen({
            scope,
            state: current,
            error: reviewError,
            listRows: listRows(api, reviewChromeRows(api, model)),
            modelColumns: valueColumns(api),
            onKeyDown: onReviewKeyDown,
            onScrollBoxRef,
          }),
        "large",
      )
    }
    pendingRowId = null
    if (current.phase === "closed") return api.ui.dialog.clear()
    return assertNever(current)
  }

  render()
}
