import type { TuiApi } from "./model-options"

/**
 * The one place the wizard learns how tall and how wide the terminal is.
 *
 * A literal list height cannot work: at 80x24 a fixed 20-row list pushes the
 * footer and the host status line off the bottom of the screen, and at 120x44
 * the same literal leaves the dialog floating. So every list budget is derived
 * from the live `CliRenderer` dimensions the plugin API exposes, minus the rows
 * the frame's own chrome and the host's chrome need.
 *
 * Two guarantees make the arithmetic safe at sizes nobody measured: the list
 * budget is clamped to at least one row, so the frame can never grow past the
 * terminal, and the review model value is given an explicit column width, so its
 * row count is a function of data rather than of a hidden layout.
 */

/** The host's own session chrome above a dialog, plus its status line below. */
const HOST_CHROME_RATIO = 0.27
const HOST_CHROME_EXTRA_ROWS = 2

/** Below this the terminal is too small to honour, so use a conventional size. */
const MIN_TERMINAL_ROWS = 8
const MIN_TERMINAL_COLUMNS = 20
const FALLBACK_TERMINAL_ROWS = 40
const FALLBACK_TERMINAL_COLUMNS = 120

/** A list never collapses below one row, and never grows past what reads well. */
const MIN_LIST_ROWS = 1
const MAX_LIST_ROWS = 20

/**
 * Non-list rows of each frame, counting the model value as a single line.
 * Targets: title, breadcrumb, section label, footer.
 * Review: title, breadcrumb, model, selected count, status line, footer.
 */
export const TARGETS_CHROME_ROWS = 8
export const REVIEW_CHROME_ROWS = 13

/** The review model row: label columns, the gap before the value, scrollbar. */
const MODEL_GUTTER_COLUMNS = 11
const SCROLLBAR_COLUMNS = 1
const MIN_VALUE_COLUMNS = 24
/** The narrowest dialog content area real captures showed, minus the gutter. */
const MAX_VALUE_COLUMNS = 63

function terminalRows(api: TuiApi): number {
  const rows = api.renderer.height
  if (!Number.isFinite(rows) || rows < MIN_TERMINAL_ROWS) return FALLBACK_TERMINAL_ROWS
  return Math.floor(rows)
}

function terminalColumns(api: TuiApi): number {
  const columns = api.renderer.width
  if (!Number.isFinite(columns) || columns < MIN_TERMINAL_COLUMNS) return FALLBACK_TERMINAL_COLUMNS
  return Math.floor(columns)
}

/**
 * Rows the host does not give a dialog. Measured from real captures: 12 rows of
 * session chrome above the dialog in a 44-row terminal and 7 in a 24-row one,
 * plus the status line below, so the reserve scales with the terminal.
 */
function hostReserveRows(api: TuiApi): number {
  return Math.ceil(terminalRows(api) * HOST_CHROME_RATIO) + HOST_CHROME_EXTRA_ROWS
}

/** How many rows a list may occupy so the whole frame fits on this terminal. */
export function listRows(api: TuiApi, chromeRows: number): number {
  const budget = terminalRows(api) - hostReserveRows(api) - chromeRows
  return Math.max(MIN_LIST_ROWS, Math.min(MAX_LIST_ROWS, budget))
}

/**
 * The column width of the review model value. Giving the value an explicit width
 * makes its row count predictable, which is what keeps the review frame's height
 * - and therefore the footer - independent of how wide the host dialog happens to
 * be. The bound is the narrowest dialog content area observed, so the value can
 * never overflow the frame sideways.
 */
export function valueColumns(api: TuiApi): number {
  const free = terminalColumns(api) - MODEL_GUTTER_COLUMNS - SCROLLBAR_COLUMNS
  return Math.max(MIN_VALUE_COLUMNS, Math.min(MAX_VALUE_COLUMNS, free))
}

/** How many terminal rows a value of `length` cells occupies at that width. */
export function valueRows(length: number, columns: number): number {
  return Math.max(1, Math.ceil(length / columns))
}

/** The review frame's real height: its chrome plus the model's wrapped rows. */
export function reviewChromeRows(api: TuiApi, model: string): number {
  return REVIEW_CHROME_ROWS + valueRows(model.length, valueColumns(api)) - 1
}
