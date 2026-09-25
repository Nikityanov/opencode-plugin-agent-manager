import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = await readFile(new URL("../src/tui/setup-state.ts", import.meta.url), "utf8")
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "setup-state.ts",
})
assert.deepEqual(transpiled.diagnostics ?? [], [])
const stateModule = await import(`data:text/javascript,${encodeURIComponent(transpiled.outputText)}`)

const { createInitialSetupState, createSetupTarget, setupReducer } = stateModule
const modelA = "provider/model-a"
const modelB = "provider/model-b"

function scenario(label, test) {
  console.log(`Given/When/Then: ${label}`)
  test()
}

function start(targets, models = [modelA, modelB]) {
  return createInitialSetupState({ targets, models })
}

function selectScope(state, scope) {
  return setupReducer(state, { type: "select-scope", scope })
}

function selectSection(state, section) {
  return setupReducer(state, { type: "select-section", section })
}

function moveCursor(state, delta) {
  return setupReducer(state, { type: "move-cursor", delta })
}

function enterTargets(scope = "oh-my", section = "agents") {
  return selectSection(selectScope(start([]), scope), section)
}

function enterModel(target = createSetupTarget("agent", "sisyphus")) {
  const targets = start([target])
  return setupReducer(setupReducer(selectSection(selectScope(targets, "oh-my"), "agents"), { type: "toggle" }), {
    type: "continue",
  })
}

scenario("Given a new wizard / When the state is created / Then it starts in hub", () => {
  const state = start([])
  assert.equal(state.phase, "hub")
  assert.equal(state.scope, null)
  assert.equal(state.section, null)
})

scenario("Given both scopes / When scope and section are selected / Then the matching targets are shown", () => {
  const state = start([
    createSetupTarget("agent", "sisyphus"),
    createSetupTarget("category", "deep"),
  ])
  const scoped = selectScope(state, "oh-my")
  assert.equal(scoped.phase, "hub")
  assert.equal(scoped.scope, "oh-my")

  const agents = selectSection(scoped, "agents")
  assert.equal(agents.phase, "targets")
  assert.deepEqual(agents.targets, [createSetupTarget("agent", "sisyphus")])

  const categories = selectSection(selectScope(state, "oh-my"), "categories")
  assert.deepEqual(categories.targets, [createSetupTarget("category", "deep")])
})

scenario("Given zero targets / When a section is selected / Then continue remains guarded", () => {
  const targets = enterTargets()
  assert.equal(targets.phase, "targets")
  assert.equal(targets.cursor, 0)
  assert.deepEqual(targets.selectedTargetIds, [])
  assert.equal(setupReducer(targets, { type: "continue" }), targets)
})

scenario("Given three targets / When the cursor moves past either edge / Then it stays in bounds", () => {
  const state = selectSection(
    selectScope(
      start([
        createSetupTarget("agent", "one"),
        createSetupTarget("agent", "two"),
        createSetupTarget("agent", "three"),
      ]),
      "oh-my",
    ),
    "agents",
  )
  const middle = moveCursor(state, 1)
  assert.equal(middle.cursor, 1)
  const last = moveCursor(middle, 99)
  assert.equal(last.cursor, 2)
  const first = moveCursor(last, -99)
  assert.equal(first.cursor, 0)
})

scenario("Given unchecked targets / When toggled, selected-all, and cleared / Then the selection is exact", () => {
  const state = selectSection(
    selectScope(
      start([
        createSetupTarget("agent", "one"),
        createSetupTarget("agent", "two"),
        createSetupTarget("category", "deep"),
      ]),
      "oh-my",
    ),
    "agents",
  )
  const toggled = setupReducer(state, { type: "toggle" })
  assert.deepEqual(toggled.selectedTargetIds, ["agent:one"])

  const selectedAll = setupReducer(toggled, { type: "select-all" })
  assert.deepEqual(selectedAll.selectedTargetIds, ["agent:one", "agent:two"])

  const cleared = setupReducer(selectedAll, { type: "clear-all" })
  assert.deepEqual(cleared.selectedTargetIds, [])
  assert.equal(setupReducer(cleared, { type: "continue" }), cleared)
})

scenario("Given a selected target and a model / When model is selected and applied / Then a request is emitted", () => {
  const model = enterModel()
  assert.equal(model.phase, "model")
  const review = setupReducer(model, { type: "select-model", model: modelA })
  assert.equal(review.phase, "review")
  assert.equal(review.model, modelA)

  const applied = setupReducer(review, { type: "apply" })
  assert.equal(applied.phase, "closed")
  assert.equal(applied.outcome, "applied")
  assert.deepEqual(applied.request, {
    scope: "oh-my",
    section: "agents",
    targetIds: ["agent:sisyphus"],
    model: modelA,
  })
})

scenario("Given no model or no target / When apply is requested / Then the state is unchanged", () => {
  const model = enterModel()
  assert.equal(setupReducer(model, { type: "apply" }), model)

  const emptyTargets = enterTargets()
  assert.equal(setupReducer(emptyTargets, { type: "toggle" }), emptyTargets)
  assert.equal(setupReducer(emptyTargets, { type: "select-all" }), emptyTargets)
  assert.equal(setupReducer(emptyTargets, { type: "apply" }), emptyTargets)
})

scenario("Given each active phase / When back is requested / Then it follows the wizard order", () => {
  const hub = start([])
  assert.equal(setupReducer(hub, { type: "back" }), hub)

  const targets = enterTargets()
  const backToHub = setupReducer(targets, { type: "back" })
  assert.equal(backToHub.phase, "hub")
  assert.equal(backToHub.scope, "oh-my")

  const model = enterModel()
  assert.equal(setupReducer(model, { type: "back" }).phase, "targets")
  const review = setupReducer(model, { type: "select-model", model: modelA })
  assert.equal(setupReducer(review, { type: "back" }).phase, "model")
})

scenario("Given an active phase / When cancel is requested / Then it closes without a request", () => {
  const states = [
    start([]),
    enterTargets(),
    enterModel(),
    setupReducer(enterModel(), { type: "select-model", model: modelA }),
  ]
  for (const state of states) {
    const closed = setupReducer(state, { type: "cancel" })
    assert.equal(closed.phase, "closed")
    assert.equal(closed.outcome, "cancelled")
    assert.equal(closed.request, null)
    assert.equal(setupReducer(closed, { type: "back" }), closed)
  }
})

scenario("Given a model phase / When an unknown model is selected / Then it cannot reach review", () => {
  const model = enterModel()
  assert.equal(setupReducer(model, { type: "select-model", model: "missing/model" }), model)
})

/**
 * D5: the review screen must be able to reach every selected target. The
 * cursor walks `selectedTargetIds`, a list the targets phase never bounded.
 */
function enterReview(targetCount) {
  const targets = Array.from({ length: targetCount }, (_unused, index) =>
    createSetupTarget("agent", `agent-${index}`),
  )
  const state = selectSection(selectScope(start(targets), "oh-my"), "agents")
  return setupReducer(setupReducer(state, { type: "select-all" }), { type: "continue" })
}

function enterReviewedModel(targetCount) {
  return setupReducer(enterReview(targetCount), { type: "select-model", model: modelA })
}

scenario("Given a full review list / When the review cursor walks and jumps / Then every target is reachable", () => {
  const review = enterReviewedModel(28)
  assert.equal(review.phase, "review")
  assert.equal(review.reviewCursor, 0)

  const stepped = setupReducer(review, { type: "move-cursor", delta: 1 })
  assert.equal(stepped.reviewCursor, 1)

  const paged = setupReducer(stepped, { type: "move-cursor", delta: 10 })
  assert.equal(paged.reviewCursor, 11)

  const last = setupReducer(paged, { type: "move-cursor", delta: 99 })
  assert.equal(last.reviewCursor, 27, "D5: the last selected target must be reachable")
  assert.equal(setupReducer(last, { type: "move-cursor", delta: 99 }).reviewCursor, 27)

  const first = setupReducer(last, { type: "move-cursor", delta: -99 })
  assert.equal(first.reviewCursor, 0, "D5: Home must reach the first selected target")
})

scenario("Given a review cursor / When the user leaves review / Then the targets cursor is untouched", () => {
  const review = setupReducer(enterReviewedModel(28), { type: "move-cursor", delta: 5 })
  const back = setupReducer(review, { type: "back" })
  assert.equal(back.phase, "model")
  assert.equal(back.reviewCursor, 5, "D5: returning to the model picker must not lose the review position")
})

scenario("Given a review list with one target / When the cursor moves / Then it stays in bounds", () => {
  const review = enterReviewedModel(1)
  assert.equal(review.reviewCursor, 0)
  assert.equal(setupReducer(review, { type: "move-cursor", delta: 1 }).reviewCursor, 0)
  assert.equal(setupReducer(review, { type: "move-cursor", delta: -1 }).reviewCursor, 0)
})

scenario("Given a review list / When apply runs from a moved cursor / Then the whole selection is written", () => {
  const review = enterReviewedModel(28)
  const moved = setupReducer(review, { type: "move-cursor", delta: 27 })
  const applied = setupReducer(moved, { type: "apply" })
  assert.equal(applied.phase, "closed")
  assert.equal(applied.request.targetIds.length, 28, "D5: Apply must not be narrowed by the review cursor")
})

console.log("Setup state contract OK")
