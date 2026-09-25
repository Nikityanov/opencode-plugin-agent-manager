import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

/**
 * Source contracts for the command palette and the setup wizard flow.
 *
 * These assertions read `src/` text rather than the built bundle, so they pin the
 * palette shape (visible rows, slash names, aliases, keybinding) and the dialog
 * contract of the wizard regardless of what the bundler emitted. The package,
 * build, and install contracts live in `verify-package.mjs`; the reducer
 * contract lives in `verify-setup.mjs`.
 */

const paletteSource = await readFile(new URL("../src/tui/commands.tsx", import.meta.url), "utf-8")
const paletteBlocks = new Map(
  [...paletteSource.matchAll(/^[^\S\n]*name: "([^"]+)",/gm)].map((match, index, all) => [
    match[1],
    paletteSource.slice(match.index, all[index + 1]?.index ?? paletteSource.length),
  ]),
)
const paletteField = (name, field) => paletteBlocks.get(name)?.match(new RegExp(`${field}: "([^"]*)"`))?.[1]

assert.equal(paletteField("amm-opencode-setup", "title"), "OpenCode agents setup")
assert.equal(paletteField("amm-ohmy-setup", "title"), "Oh My OpenAgent setup")
assert.equal(paletteField("amm-opencode-setup", "slashName"), "amm-opencode-setup")
assert.equal(paletteField("amm-ohmy-setup", "slashName"), "amm-ohmy-setup")
assert.equal(
  [...paletteBlocks.values()].filter((block) => !/hidden: true/.test(block)).length,
  2,
  "palette contract: exactly the two setup rows may stay visible",
)
for (const [legacy, ownSlashName] of [
  ["amm", null],
  ["amm-opencode", null],
  ["amm-all-ohmy", "amm-all-ohmy"],
  ["amm-status", "amm-status"],
  ["amm-opencode-all", "amm-opencode-all"],
  ["amm-opencode-status", "amm-opencode-status"],
]) {
  const block = paletteBlocks.get(legacy) ?? ""
  assert.match(block, /hidden: true/, `palette contract: ${legacy} must stay registered but hidden`)
  assert.equal(
    paletteField(legacy, "slashName") ?? null,
    ownSlashName,
    `palette contract: ${legacy} must ${ownSlashName ? `keep /${ownSlashName}` : "leave /" + legacy + " to the alias table"}`,
  )
}
assert.equal(
  paletteSource.match(/slashAliases: \[[^\]]*\]/g)?.join(" ~ "),
  'slashAliases: ["amm", "model-config", "agent-config"] ~ slashAliases: ["amm-opencode"]',
  "palette contract: the superseded slash names may only be declared as aliases",
)
assert.match(
  paletteSource,
  /const ohMyCommands = configLocation\s*\?\s*\[/,
  "palette contract: the oh-my rows must be gated on configLocation",
)
const ohMyStart = paletteSource.indexOf("const ohMyCommands")
const ohMyEnd = paletteSource.indexOf(": []", ohMyStart)
const conditional = paletteSource.slice(ohMyStart, ohMyEnd)
assert.match(conditional, /name: "amm-ohmy-setup",/, "palette contract: oh-my rows are conditional")
assert.doesNotMatch(conditional, /name: "amm-opencode-setup",/, "palette contract: OpenCode row is unconditional")
assert.match(
  paletteSource,
  /const openCodeCommands = \[\n/,
  "palette contract: the OpenCode rows must be registered unconditionally",
)
assert.match(
  paletteSource,
  /const primaryCommand = configLocation \? "amm-ohmy-setup" : "amm-opencode-setup"/,
  "palette contract: ctrl+shift+m must run the primary setup command",
)
/**
 * The host splits its own registration in two (`app.tsx`): a mode-less command
 * layer and a separate `mode: OPENCODE_BASE_MODE` binding layer. That split is
 * load-bearing, not stylistic. The command palette is itself a dialog, so
 * opening it pushes the host's "modal" mode; a command layer scoped to "base"
 * goes inactive at the exact moment the palette queries it and its rows vanish
 * from the palette and from slash resolution. The shortcut must still be
 * base-scoped so it cannot re-enter an already-open modal.
 */
assert.match(
  paletteSource,
  /registerLayer\(\{ commands \}\)/,
  "palette contract: the command layer must be registered without a mode so the rows stay reachable in the palette's modal mode",
)
assert.match(
  paletteSource,
  /registerLayer\(\{\s*mode: "base",\s*bindings: \[\{ key: "ctrl\+shift\+m", cmd: primaryCommand/,
  "palette contract: the binding layer must stay mode-scoped to base and bound to the primary command",
)
assert.doesNotMatch(
  paletteSource,
  /registerLayer\(\{[^}]*mode: "base"[^}]*commands/,
  "palette contract: a base-scoped layer may not carry commands, or the palette will not see them",
)

const setupFlowSource = await readFile(new URL("../src/tui/setup-flows.tsx", import.meta.url), "utf-8")
const setupScreensSource = await readFile(new URL("../src/tui/setup-screens.tsx", import.meta.url), "utf-8")
const setupViewSource = await readFile(new URL("../src/tui/setup-view.tsx", import.meta.url), "utf-8")
assert.doesNotMatch(setupFlowSource, /api\.ui\.Dialog\b/, "setup contract: no nested host dialog")

/**
 * D1: every screen builder must be *called* inside the thunk the host hands to
 * `dialog.replace`. Building the element first runs `createComponent` outside the
 * host's DialogProvider and throws `useDialog must be used within a DialogProvider`.
 * The assertion is structural: `showDialog` forwards its first parameter straight
 * into `replace`, and each builder appears only as a `showDialog(() => ...)` call.
 */
const screenBuilders = ["hubScreen", "targetsScreen", "modelScreen", "reviewScreen"]
assert.doesNotMatch(
  setupFlowSource,
  /(?:const|let|var)\s+\w+\s*=\s*(?:hubScreen|targetsScreen|modelScreen|reviewScreen)\(/,
  "D1: a screen element may not be built before dialog.replace; it must be built inside the replace thunk",
)
assert.doesNotMatch(
  setupFlowSource,
  /dialog\.replace\(\(\)\s*=>\s*(?:content|element)\s*\)/,
  "D1: replace must receive the render thunk itself, not an already-built element",
)
assert.match(
  setupFlowSource,
  /function showDialog\(\s*render\s*:\s*\(\)\s*=>\s*JSX\.Element\s*,\s*size\s*:\s*"medium"\s*\|\s*"large"\s*\)[\s\S]{0,160}?api\.ui\.dialog\.replace\(render\)\s*\n\s*api\.ui\.dialog\.setSize\(size\)/,
  "D1: showDialog must forward its render thunk to replace, and setSize must follow replace",
)
for (const builder of screenBuilders) {
  const callSites = [...setupFlowSource.matchAll(new RegExp(`\\b${builder}\\(`, "g"))]
  assert.equal(callSites.length, 1, `D1: ${builder} must be called exactly once, inside a replace thunk`)
  assert.match(
    setupFlowSource,
    new RegExp(`showDialog\\(\\s*\\(\\)\\s*=>\\s*${builder}\\(`),
    `D1: ${builder} must be constructed inside the showDialog/replace thunk`,
  )
}

/**
 * D2/D5 regression: the cursor row is only ever reachable through the live
 * scrollbox the ref callback hands over. A detached microtask cannot scroll a
 * scrollbox that `replace` already destroyed, so that shape must not reappear.
 */
assert.doesNotMatch(
  setupFlowSource,
  /queueMicrotask\([\s\S]*?scrollChildIntoView/,
  "D2: scrollChildIntoView must run on the live scrollbox from onScrollBoxRef, not in a detached microtask",
)
assert.match(
  setupFlowSource,
  /function onScrollBoxRef\([^)]*\)[\s\S]{0,320}?scrollChildIntoView/,
  "D2: onScrollBoxRef must apply the pending scroll on the fresh instance",
)

/**
 * D3: a hard-coded list height clips the footer on a short terminal. The height
 * must come from the terminal, not from a literal in the view.
 */
for (const source of [setupViewSource]) {
  assert.doesNotMatch(
    source,
    /maxHeight=\{\d+\}/,
    "D3: a literal maxHeight clips the footer; derive the list height from the terminal instead",
  )
}
assert.match(
  setupViewSource,
  /maxHeight=\{[^}]*\b(?:listRows|rows)\b[^}]*\}/,
  "D3: the scrollbox height must be the terminal-derived row budget",
)

/**
 * D4: the cursor marker, the name and the metadata must be separate `<text>`
 * children of the row, otherwise a wrapped name continues at the text origin.
 */
assert.doesNotMatch(
  setupViewSource,
  /\$\{index\(\) === props\.cursor \? ">" : " "\} \$\{row\.selected \? "\[x\]" : "\[ \]"\}/,
  "D4: the cursor marker and the name may not share one <text>; each column needs its own <text>",
)

/**
 * D5: the review screen must be keyboard-navigable, not a blind list.
 */
assert.match(
  setupScreensSource,
  /export function reviewKey\(/,
  "D5: the review screen needs its own key contract",
)
const reviewSummary = setupViewSource.slice(setupViewSource.indexOf("export function ReviewSummary"))
assert.match(
  reviewSummary,
  /props\.cursor/,
  "D5: the review list must render a cursor",
)
assert.match(
  reviewSummary,
  /targetRowId\(/,
  "D5: the review rows must carry the row ids the live scrollbox scrolls to",
)
assert.match(
  setupFlowSource,
  /reviewKey\(/,
  "D5: the flow must route review keys through the review key contract",
)

/**
 * Host-owned keys. These assertions are derived from the key literals the wizard
 * actually handles, so they are checked where the contract lives
 * (`targetsKey`/`reviewKey` switch cases and the flow's `event.name` reads)
 * instead of grepping a file that could never contain them.
 */
const handledKeys = new Set([
  ...[...setupScreensSource.matchAll(/case "([a-z+]+)":/g)].map((match) => match[1]),
  ...[...setupFlowSource.matchAll(/event\.name === "([a-z+]+)"/g)].map((match) => match[1]),
  ...[...paletteSource.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]),
])
assert.equal(handledKeys.size > 0, true, "key contract: the handled key set must be extractable")
for (const owned of ["escape", "ctrl+c", "ctrl+return"]) {
  assert.equal(
    handledKeys.has(owned),
    false,
    `setup contract: ${owned} stays host-owned but appears in the handled key contract`,
  )
}
assert.doesNotMatch(
  setupFlowSource,
  /api\.mode\.push/,
  "setup contract: a custom mode must not be pushed over the host dialog",
)
assert.match(
  setupFlowSource,
  /reviewError = null[\s\S]{0,80}update\(\{ type: "back" \}\)/,
  "setup contract: leaving review must clear a previous apply failure",
)
assert.match(
  setupFlowSource,
  /options\.apply\(applied\.request\)/,
  "setup contract: persistence must run only from the apply path",
)
/**
 * The two writes live in `./setup-entry`, the scope module the flow calls into.
 * The count is still asserted across the whole wizard, so moving a write between
 * those two modules cannot make the invariant pass.
 */
const setupEntrySource = await readFile(new URL("../src/tui/setup-entry.ts", import.meta.url), "utf-8")
const wizardSource = setupFlowSource + setupEntrySource
const persistCalls = wizardSource.match(/writeConfig\(|setOpenCodeAgentModels\(/g) ?? []
assert.equal(
  persistCalls.length,
  2,
  "setup contract: exactly one OpenCode and one oh-my write may exist in the wizard",
)
assert.doesNotMatch(
  setupFlowSource,
  /writeConfig\(|setOpenCodeAgentModels\(/,
  "setup contract: the state machine must not write configuration itself",
)
assert.match(
  setupFlowSource,
  /choice === "review"[\s\S]{0,80}options\.showAssignments\(\)/,
  "setup contract: the review hub row must delegate to the existing status handler",
)
assert.match(
  setupEntrySource,
  /showAssignments: \(\) => handleOpenCodeStatusCommand\(api, openCodeConfigPath\)/,
  "setup contract: the OpenCode review row reuses handleOpenCodeStatusCommand",
)
assert.match(
  setupEntrySource,
  /showAssignments: \(\) => handleStatusCommand\(api, configLocation\)/,
  "setup contract: the oh-my review row reuses handleStatusCommand",
)

console.log("Command palette contract OK")