import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

/**
 * D3: the wizard's list and column budgets.
 *
 * A hard-coded list height clips the footer and the host status line on a short
 * terminal, and a hard-coded model column either overflows a narrow frame or
 * makes the review frame's height unpredictable. Both budgets are derived here
 * from the same terminal dimensions, so the two failure modes are checked
 * together against the sizes real-terminal QA measured.
 */

const source = await readFile(new URL("../src/tui/viewport.ts", import.meta.url), "utf8")
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "viewport.ts",
})
assert.deepEqual(transpiled.diagnostics ?? [], [], "D3: viewport.ts must transpile without diagnostics")
const viewport = await import(`data:text/javascript,${encodeURIComponent(transpiled.outputText)}`)
const { listRows, valueColumns, valueRows, reviewChromeRows, TARGETS_CHROME_ROWS, REVIEW_CHROME_ROWS } = viewport

function scenario(label, test) {
  console.log(`Given/When/Then: ${label}`)
  test()
}

const sized = (height, width = 120) => ({ renderer: { height, width } })

/** Rows a dialog may actually use at each size, taken from real captures. */
const MEASURED = [
  { height: 44, available: 30, chrome: TARGETS_CHROME_ROWS },
  { height: 24, available: 15, chrome: TARGETS_CHROME_ROWS },
]

scenario("Given a tall terminal / When the row budget is derived / Then the full list is shown", () => {
  assert.equal(listRows(sized(44), TARGETS_CHROME_ROWS), 20, "D3: 120x44 keeps the full list budget")
  assert.equal(
    TARGETS_CHROME_ROWS,
    8,
    "D3: the targets chrome is title, breadcrumb, section label, footer and their gaps",
  )
})

scenario("Given a short terminal / When the row budget is derived / Then the list shrinks to fit", () => {
  assert.ok(
    listRows(sized(24), TARGETS_CHROME_ROWS) < listRows(sized(44), TARGETS_CHROME_ROWS),
    "D3: an 80x24 terminal must get a smaller list than a 120x44 one",
  )
  assert.ok(
    listRows(sized(24), TARGETS_CHROME_ROWS) >= 3,
    "D3: 80x24 must still show several targets, not a token list",
  )
})

scenario("Given every measured size / When the row budget is derived / Then the frame fits and the footer survives", () => {
  for (const { height, available, chrome } of MEASURED) {
    const rows = listRows(sized(height), chrome)
    assert.ok(rows + chrome <= available, `D3: at ${height} rows the frame must fit in ${available} usable rows`)
    assert.ok(rows >= 1, `D3: at ${height} rows the list must keep at least one row`)
  }
})

scenario("Given a hostile terminal size / When the row budget is derived / Then it falls back", () => {
  // An unusable height must behave exactly like the documented 40-row fallback.
  const fallback = listRows(sized(40), TARGETS_CHROME_ROWS)
  assert.equal(listRows({ renderer: { height: Number.NaN } }, TARGETS_CHROME_ROWS), fallback)
  assert.equal(listRows({ renderer: { height: 0 } }, TARGETS_CHROME_ROWS), fallback)
  assert.equal(listRows(sized(24.9), TARGETS_CHROME_ROWS), listRows(sized(24), TARGETS_CHROME_ROWS))
})

scenario("Given a model value / When the review frame is measured / Then its height is a function of data", () => {
  assert.equal(
    reviewChromeRows(sized(44), "provider/model"),
    REVIEW_CHROME_ROWS,
    "D3: a one-line model must not change the review chrome",
  )
  const columns = valueColumns(sized(44))
  const long = "x".repeat(columns * 2 + 1)
  assert.equal(valueRows(long.length, columns), 3, "D3: the wrapped row count must match the column budget")
  assert.equal(
    reviewChromeRows(sized(44), long),
    REVIEW_CHROME_ROWS + 2,
    "D3: a model that wraps onto a third row must grow the review chrome by two",
  )
})

scenario("Given a narrow terminal / When the model column budget is derived / Then it cannot overflow", () => {
  assert.equal(
    valueColumns(sized(44, 200)),
    63,
    "D3: a very wide terminal must not stretch the model column without bound",
  )
  assert.ok(
    valueColumns(sized(44, 60)) < 63,
    "D3: a genuinely narrow terminal must give the model fewer columns",
  )
  assert.ok(
    11 + valueColumns(sized(44, 80)) <= 74,
    "D3: the model row must fit the narrowest dialog content area observed",
  )
  assert.ok(
    11 + valueColumns(sized(44, 40)) <= 40,
    "D3: a tiny terminal must not push the model value off the frame",
  )
})

console.log("Viewport budget contract OK")
