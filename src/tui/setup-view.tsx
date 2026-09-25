/** @jsxImportSource @opentui/solid */

import { TextAttributes, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { For, type JSX } from "solid-js"
import type { SetupTarget } from "./setup-state"

/**
 * View-only primitives for the hierarchical setup wizard.
 *
 * Every component returns raw OpenTUI JSX so the flow can hand it straight to
 * the thunk `api.ui.dialog.replace` receives. Nothing here touches dialog APIs,
 * keymap layers, persistence, or reducer state: the flow owns transitions and
 * scrolling and passes its own key handler plus a scrollbox ref callback.
 *
 * Escape, Ctrl+C, and Ctrl+Return stay host-owned, so no binding here shadows
 * them. Selection is carried by text markers (`[x]`, `[ ]`, `>`, `[current]`,
 * `[inherited]`) and TextAttributes only, never by color alone.
 *
 * Every row is a flexbox row of *separate* `<text>` children - marker,
 * checkbox, name, metadata - so a name too long for its column wraps under its
 * own column instead of under the row's left gutter.
 */

export type SetupKeyHandler = (event: KeyEvent) => void

export type ScrollBoxRefHandler = (instance: ScrollBoxRenderable) => void

/** Row ids are shared by the targets list and the review list. */
export function targetRowId(index: number): string {
  return `amm-target-row-${index}`
}

/** Column widths of the row gutter: `> `, `[ ]`, then one space of separation. */
const MARKER_COLUMNS = 2
const CHECK_COLUMNS = 3
const NAME_GAP = 1
/** Keeps a long value wrapping into more rows instead of overflowing sideways. */
const VALUE_MIN_COLUMNS = 8

function assertNever(value: never): never {
  return value
}

export type SetupFrameProps = {
  readonly title: string
  readonly breadcrumb: readonly string[]
  readonly body: JSX.Element
  readonly footer: readonly string[]
}

export function SetupFrame(props: SetupFrameProps): JSX.Element {
  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2}>
      <text attributes={TextAttributes.BOLD}>{props.title}</text>
      <text attributes={TextAttributes.DIM}>{props.breadcrumb.join(" / ")}</text>
      <box flexDirection="column" flexShrink={1} minHeight={0}>
        {props.body}
      </box>
      <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <For each={props.footer}>
          {(hint) => <text attributes={TextAttributes.DIM}>{hint}</text>}
        </For>
      </box>
    </box>
  )
}

export type TargetRowModel = {
  readonly target: SetupTarget
  readonly selected: boolean
  readonly current: boolean
  readonly inherited: boolean
  readonly metadata: string | null
}

export type TargetCheckboxListProps = {
  readonly sectionLabel: string
  readonly rows: readonly TargetRowModel[]
  readonly cursor: number
  readonly listRows: number
  readonly onKeyDown: SetupKeyHandler
  readonly onScrollBoxRef: ScrollBoxRefHandler
}

function rowAttributes(focused: boolean): number {
  return focused ? TextAttributes.BOLD : TextAttributes.NONE
}

function targetMetadata(row: TargetRowModel): string {
  return `${row.current ? "[current]" : ""} ${row.inherited ? "[inherited]" : ""} ${row.metadata ?? ""}`.trim()
}

export function TargetCheckboxList(props: TargetCheckboxListProps): JSX.Element {
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD}>{props.sectionLabel}</text>
        <text attributes={TextAttributes.DIM}>
          {`${props.rows.filter((row) => row.selected).length}/${props.rows.length} selected`}
        </text>
      </box>
      <scrollbox
        focused
        scrollY
        flexShrink={1}
        maxHeight={props.listRows}
        onKeyDown={props.onKeyDown}
        ref={props.onScrollBoxRef}
      >
        <box flexDirection="column">
          {props.rows.length === 0 ? (
            <text attributes={TextAttributes.DIM}>no targets available</text>
          ) : (
            <For each={props.rows}>
              {(row, index) => (
                <box id={targetRowId(index())} flexDirection="row">
                  <text width={MARKER_COLUMNS} attributes={rowAttributes(index() === props.cursor)}>
                    {index() === props.cursor ? "> " : "  "}
                  </text>
                  <text width={CHECK_COLUMNS} attributes={rowAttributes(index() === props.cursor)}>
                    {row.selected ? "[x]" : "[ ]"}
                  </text>
                  <text
                    flexGrow={1}
                    flexShrink={1}
                    minWidth={VALUE_MIN_COLUMNS}
                    marginLeft={NAME_GAP}
                    attributes={rowAttributes(index() === props.cursor)}
                  >
                    {row.target.key}
                  </text>
                  <text
                    flexShrink={1}
                    minWidth={VALUE_MIN_COLUMNS}
                    marginLeft={NAME_GAP}
                    attributes={TextAttributes.DIM}
                  >
                    {targetMetadata(row)}
                  </text>
                </box>
              )}
            </For>
          )}
        </box>
      </scrollbox>
    </box>
  )
}

export type ReviewStatus = "ready" | "applying" | "success" | "error"

export type ReviewSummaryProps = {
  readonly scope: string
  readonly section: string
  readonly targetNames: readonly string[]
  readonly model: string
  readonly modelColumns: number
  readonly cursor: number
  readonly listRows: number
  readonly status: ReviewStatus
  readonly statusMessage: string | null
  readonly actions: readonly string[]
  readonly onKeyDown: SetupKeyHandler
  readonly onScrollBoxRef: ScrollBoxRefHandler
}

/** Column of the model value, so a wrapped identifier stays under itself. */
const MODEL_LABEL_COLUMNS = 5
const MODEL_GAP = 6

function reviewStatusText(status: ReviewStatus, message: string | null): string {
  switch (status) {
    case "ready":
      return "apply to write the configuration"
    case "applying":
      return "[applying] writing configuration"
    case "success":
      return `[ok] ${message ?? "applied"}`
    case "error":
      return `[error] ${message ?? "apply failed"}`
    default:
      return assertNever(status)
  }
}

export function ReviewSummary(props: ReviewSummaryProps): JSX.Element {
  return (
    <SetupFrame
      title="Review"
      breadcrumb={[props.scope, props.section]}
      footer={props.actions}
      body={
        <box flexDirection="column" gap={1}>
          <box flexDirection="row">
            <text width={MODEL_LABEL_COLUMNS} flexShrink={0} attributes={TextAttributes.BOLD}>
              model
            </text>
            <text
              width={props.modelColumns}
              flexShrink={1}
              marginLeft={MODEL_GAP}
            >
              {props.model}
            </text>
          </box>
          <text attributes={TextAttributes.DIM}>
            {`${props.targetNames.length} target${props.targetNames.length === 1 ? "" : "s"} selected`}
          </text>
          <scrollbox
            focused
            scrollY
            flexShrink={1}
            maxHeight={props.listRows}
            onKeyDown={props.onKeyDown}
            ref={props.onScrollBoxRef}
          >
            <box flexDirection="column">
              {props.targetNames.length === 0 ? (
                <text attributes={TextAttributes.DIM}>no targets selected</text>
              ) : (
                <For each={props.targetNames}>
                  {(name, index) => (
                    <box id={targetRowId(index())} flexDirection="row">
                      <text
                        width={MARKER_COLUMNS}
                        attributes={rowAttributes(index() === props.cursor)}
                      >
                        {index() === props.cursor ? "> " : "  "}
                      </text>
                      <text width={CHECK_COLUMNS} attributes={rowAttributes(index() === props.cursor)}>
                        [x]
                      </text>
                      <text
                        flexShrink={1}
                        minWidth={VALUE_MIN_COLUMNS}
                        marginLeft={NAME_GAP}
                        attributes={rowAttributes(index() === props.cursor)}
                      >
                        {name}
                      </text>
                    </box>
                  )}
                </For>
              )}
            </box>
          </scrollbox>
          <text attributes={TextAttributes.DIM}>
            {reviewStatusText(props.status, props.statusMessage)}
          </text>
        </box>
      }
    />
  )
}
