/** @jsxImportSource @opentui/solid */

import type { TuiDialogSelectOption } from "@opencode-ai/plugin/tui"
import type { JSX } from "solid-js"
import type { TuiApi } from "./model-options"
import type {
  ModelState,
  ReviewState,
  SetupAction,
  SetupScope,
  SetupSection,
  TargetsState,
} from "./setup-state"
import type { SetupTargets } from "./setup-targets"
import {
  ReviewSummary,
  SetupFrame,
  TargetCheckboxList,
  type ScrollBoxRefHandler,
  type SetupKeyHandler,
} from "./setup-view"

/**
 * The presentation layer of the setup wizard: one pure builder per logical
 * screen, plus the copy and the key contract those screens share.
 *
 * Every builder is a function of its props alone. None of them touches the
 * dialog API, the reducer, persistence, or toasts: the flow owns transitions
 * and hands the returned raw OpenTUI JSX straight to `api.ui.dialog.replace`.
 * Escape, Ctrl+C and Ctrl+Return stay host-owned, so no key string is rebound
 * here; the target list key contract is the only place a key is interpreted.
 */

const PAGE_STEP = 10
const NO_MODEL_LABEL = "(no model selected)"
const REVIEW_LABEL = "Review assignments"
const TARGETS_FOOTER = ["up/down, pgup/pgdn", "space, a, n to select", "enter next, backspace back"]
const REVIEW_ACTIONS = ["up/down, pgup/pgdn, home/end", "enter apply", "backspace back"]

/** The sentinel value of the trailing `Back` row in the model picker. */
export const MODEL_BACK_OPTION = "__amm_back__"

const LABELS: Readonly<Record<SetupScope | SetupSection, string>> = {
  opencode: "OpenCode",
  "oh-my": "Oh My OpenAgent",
  agents: "Agents",
  categories: "Categories",
}

/** A hub row: one section, or the shortcut into the read-only review screen. */
export type HubChoice = SetupSection | "review"

/** What one keystroke on the target checkbox list means, in one tagged union. */
export type TargetsKey =
  | { readonly kind: "move"; readonly delta: number }
  | { readonly kind: "select"; readonly action: SetupAction }
  | { readonly kind: "continue" }
  | { readonly kind: "back" }

type KeyCursorInput = {
  readonly name: string
  readonly cursor: number
  readonly count: number
}

/**
 * The shared navigation half of both list key contracts. A long target list
 * needs more than one row at a time, so the cursor must be able to walk, page
 * and jump in every list that shows a cursor.
 */
function navigationKey(input: KeyCursorInput): TargetsKey | null {
  switch (input.name) {
    case "up":
      return { kind: "move", delta: -1 }
    case "down":
      return { kind: "move", delta: 1 }
    case "pageup":
      return { kind: "move", delta: -PAGE_STEP }
    case "pagedown":
      return { kind: "move", delta: PAGE_STEP }
    case "home":
      return { kind: "move", delta: -input.cursor }
    case "end":
      return { kind: "move", delta: input.count - 1 - input.cursor }
    default:
      return null
  }
}

/** The complete key contract of the target checkbox list, in one place. */
export function targetsKey(input: KeyCursorInput): TargetsKey | null {
  const navigation = navigationKey(input)
  if (navigation !== null) return navigation
  switch (input.name) {
    case "space":
      return { kind: "select", action: { type: "toggle" } }
    case "a":
      return { kind: "select", action: { type: "select-all" } }
    case "n":
      return { kind: "select", action: { type: "clear-all" } }
    case "return":
      return { kind: "continue" }
    case "backspace":
      return { kind: "back" }
    default:
      return null
  }
}

/**
 * The review screen's key contract. Every selected target must be reachable
 * before Apply, so navigation comes first and only then the two commit keys.
 */
export function reviewKey(input: KeyCursorInput): TargetsKey | null {
  const navigation = navigationKey(input)
  if (navigation !== null) return navigation
  switch (input.name) {
    case "return":
      return { kind: "continue" }
    case "backspace":
      return { kind: "back" }
    default:
      return null
  }
}

function targetRows(state: TargetsState, data: SetupTargets) {
  return state.targets.map((target) => {
    const model = data.currentModels.get(target.id)
    return {
      target,
      selected: state.selectedTargetIds.includes(target.id),
      current: model !== undefined,
      inherited: data.inheritedIds.has(target.id),
      metadata: model ?? null,
    }
  })
}

function selectedNames(state: TargetsState | ModelState | ReviewState): string[] {
  const selected = new Set(state.selectedTargetIds)
  return state.targets.filter((target) => selected.has(target.id)).map((target) => target.key)
}

export type HubScreenProps = {
  readonly DialogSelect: TuiApi["ui"]["DialogSelect"]
  readonly title: string
  readonly sections: readonly SetupSection[]
  readonly onSelect: (choice: HubChoice) => void
}

export function hubScreen(props: HubScreenProps): JSX.Element {
  const DialogSelect = props.DialogSelect
  const choices: HubChoice[] = [...props.sections, "review"]
  return (
    <DialogSelect<HubChoice>
      title={props.title}
      options={choices.map((choice) => ({
        title: choice === "review" ? REVIEW_LABEL : LABELS[choice],
        value: choice,
      }))}
      onSelect={(option) => props.onSelect(option.value)}
    />
  )
}

export type ModelScreenProps = {
  readonly DialogSelect: TuiApi["ui"]["DialogSelect"]
  readonly section: SetupSection
  readonly options: TuiDialogSelectOption<string>[]
  readonly current: string | null
  readonly onSelect: (value: string) => void
}

export function modelScreen(props: ModelScreenProps): JSX.Element {
  const DialogSelect = props.DialogSelect
  return (
    <DialogSelect<string>
      title={`Select model for ${LABELS[props.section]}`}
      options={props.options}
      {...(props.current === null ? {} : { current: props.current })}
      onSelect={(option) => props.onSelect(option.value)}
    />
  )
}

export type TargetsScreenProps = {
  readonly title: string
  readonly scope: SetupScope
  readonly state: TargetsState
  readonly data: SetupTargets
  readonly listRows: number
  readonly onKeyDown: SetupKeyHandler
  readonly onScrollBoxRef: ScrollBoxRefHandler
}

export function targetsScreen(props: TargetsScreenProps): JSX.Element {
  return (
    <SetupFrame
      title={props.title}
      breadcrumb={[LABELS[props.scope], LABELS[props.state.section]]}
      body={
        <TargetCheckboxList
          sectionLabel={LABELS[props.state.section]}
          rows={targetRows(props.state, props.data)}
          cursor={props.state.cursor}
          listRows={props.listRows}
          onKeyDown={props.onKeyDown}
          onScrollBoxRef={props.onScrollBoxRef}
        />
      }
      footer={TARGETS_FOOTER}
    />
  )
}

export type ReviewScreenProps = {
  readonly scope: SetupScope
  readonly state: ReviewState
  readonly error: string | null
  readonly listRows: number
  readonly modelColumns: number
  readonly onKeyDown: SetupKeyHandler
  readonly onScrollBoxRef: ScrollBoxRefHandler
}

export function reviewScreen(props: ReviewScreenProps): JSX.Element {
  return (
    <ReviewSummary
      scope={LABELS[props.scope]}
      section={LABELS[props.state.section]}
      targetNames={selectedNames(props.state)}
      model={props.state.model ?? NO_MODEL_LABEL}
      modelColumns={props.modelColumns}
      cursor={props.state.reviewCursor}
      listRows={props.listRows}
      status={props.error === null ? "ready" : "error"}
      statusMessage={props.error}
      actions={REVIEW_ACTIONS}
      onKeyDown={props.onKeyDown}
      onScrollBoxRef={props.onScrollBoxRef}
    />
  )
}
