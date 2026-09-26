import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { join } from "node:path"
import ts from "typescript"
import { createApi } from "./fixture.mjs"

/**
 * D5: pinned models.
 *
 * The picker lists every model of every provider and is re-entered on every
 * assignment, so a person walks past the same hundred rows to reach the two
 * models they actually use. Pins are the fix, and the two things that can go
 * wrong are checked here: the order a picker hands to the host, and the stored
 * value, which comes back from the host as `unknown` and must never be able to
 * break a picker.
 *
 * `./pinned-models` is pure and type-only in its imports, so it is transpiled
 * and loaded on its own; the rest of the contract is checked against the built
 * plugin through the host fixture.
 */

const STORAGE_KEY = "agent-model-manager.pinned-models"
const PINNED = "Pinned"
const BACK = "__back__"
const CLEAR = "__clear__"

const source = await readFile(new URL("../src/tui/pinned-models.ts", import.meta.url), "utf8")
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: "pinned-models.ts",
})
assert.deepEqual(transpiled.diagnostics ?? [], [], "D5: pinned-models.ts must transpile without diagnostics")
const pins = await import(`data:text/javascript,${encodeURIComponent(transpiled.outputText)}`)

function scenario(label, test) {
  console.log(`Given/When/Then: ${label}`)
  test()
}

/** Same, for the scenarios that have to load the built plugin first. */
async function asyncScenario(label, test) {
  console.log(`Given/When/Then: ${label}`)
  await test()
}

/** A host whose only relevant surface is the plugin key-value store. */
function kvApi(initial, ready = true) {
  const store = new Map()
  if (initial !== undefined) store.set(STORAGE_KEY, initial)
  const writes = []
  return {
    api: {
      kv: {
        ready,
        get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
        set: (key, value) => {
          writes.push(value)
          store.set(key, value)
        },
      },
    },
    writes,
    stored: () => store.get(STORAGE_KEY),
  }
}

const models = [
  { value: "test/one", title: "Test / One" },
  { value: "test/two", title: "Test / Two" },
  { value: "other/three", title: "Other / Three" },
]

const values = (options) => options.map((option) => option.value)
const categories = (options) => options.map((option) => option.category ?? null)

scenario("Given no stored pins / When the picker is built / Then the order is untouched and ungrouped", () => {
  const { api } = kvApi()
  const options = pins.toModelPickerOptions(models, pins.readPinnedModels(api), [
    { title: "Back", value: BACK },
  ])
  assert.deepEqual(values(options), ["test/one", "test/two", "other/three", BACK])
  assert.deepEqual(
    categories(options),
    [null, null, null, null],
    "D5: with nothing pinned the picker must look exactly as it did before pins existed",
  )
})

scenario("Given one pinned model / When the picker is built / Then it leads the list under the Pinned group", () => {
  const { api } = kvApi(["test/two"])
  const options = pins.toModelPickerOptions(models, pins.readPinnedModels(api))
  assert.deepEqual(values(options), ["test/two", "test/one", "other/three"])
  assert.deepEqual(categories(options), [PINNED, null, null])
})

scenario("Given a pinned model / When the picker is built / Then it appears exactly once", () => {
  const { api } = kvApi(["test/one"])
  const options = pins.toModelPickerOptions(models, pins.readPinnedModels(api))
  assert.equal(
    values(options).filter((value) => value === "test/one").length,
    1,
    "D5: a pinned model is moved into the group, never repeated in the provider list",
  )
})

scenario("Given several pinned models / When the picker is built / Then they lead the list in model order", () => {
  const { api } = kvApi(["other/three", "test/one"])
  const options = pins.toModelPickerOptions(models, pins.readPinnedModels(api))
  assert.deepEqual(
    values(options),
    ["test/one", "other/three", "test/two"],
    "D5: the group follows the model list, not the order things were pinned, so pinning a third model never reshuffles the two already there",
  )
  assert.deepEqual(categories(options), [PINNED, PINNED, null])
})

scenario("Given a pinned model and trailing rows / When the picker is built / Then the trailing rows stay last", () => {
  const { api } = kvApi(["test/one"])
  const options = pins.toModelPickerOptions(models, pins.readPinnedModels(api), [
    { title: "Back", value: BACK },
    { title: "Clear model override", value: CLEAR },
  ])
  assert.deepEqual(values(options), ["test/one", "test/two", "other/three", BACK, CLEAR])
  assert.equal(
    options.at(-1).category,
    undefined,
    "D5: a non-model row must never inherit the Pinned group",
  )
})

scenario("Given a pin / When it is toggled twice / Then the stored list returns to its original value", () => {
  const { api, writes } = kvApi([])
  assert.equal(pins.togglePinnedModel(api, "test/one"), true)
  assert.deepEqual(pins.readPinnedModels(api), ["test/one"])
  assert.equal(pins.togglePinnedModel(api, "test/one"), false)
  assert.deepEqual(pins.readPinnedModels(api), [])
  assert.deepEqual(
    writes,
    [["test/one"], []],
    "D5: every toggle persists exactly one list, so the two toggles cancel out",
  )
})

scenario("Given several pins / When one is toggled off / Then the rest are kept in order", () => {
  const { api } = kvApi(["test/one", "test/two", "other/three"])
  assert.equal(pins.togglePinnedModel(api, "test/two"), false)
  assert.deepEqual(pins.readPinnedModels(api), ["test/one", "other/three"])
})

scenario("Given a blank model / When it is toggled / Then nothing is written", () => {
  const { api, writes } = kvApi(["test/one"])
  assert.equal(pins.togglePinnedModel(api, "   "), false)
  assert.deepEqual(pins.readPinnedModels(api), ["test/one"])
  assert.deepEqual(writes, [], "D5: a blank value must not enter the store")
})

scenario("Given a corrupt stored value / When it is read / Then the pins are empty and nothing throws", () => {
  for (const corrupt of [
    "test/one",
    42,
    null,
    { model: "test/one" },
    [1, null, "", "   "],
    [["test/one"]],
  ]) {
    const { api } = kvApi(corrupt)
    assert.deepEqual(
      pins.readPinnedModels(api),
      [],
      `D5: ${JSON.stringify(corrupt)} is not a pin list and must read as no pins`,
    )
    const options = pins.toModelPickerOptions(models, pins.readPinnedModels(api))
    assert.deepEqual(
      values(options),
      ["test/one", "test/two", "other/three"],
      `D5: ${JSON.stringify(corrupt)} must leave the picker usable`,
    )
  }
})

scenario("Given a stored list with blanks and duplicates / When it is read / Then it is sanitized", () => {
  const { api } = kvApi([" test/one ", "test/one", "", "  ", 7, "test/two"])
  assert.deepEqual(pins.readPinnedModels(api), ["test/one", "test/two"])
})

scenario("Given a store that is not ready / When pins are read and toggled / Then nothing is read or written", () => {
  const { api, writes } = kvApi(["test/one"], false)
  assert.deepEqual(pins.readPinnedModels(api), [], "D5: an unready store must read as no pins")
  assert.equal(pins.togglePinnedModel(api, "test/two"), false)
  assert.deepEqual(
    writes,
    [],
    "D5: a write built from an unreadable store would destroy the real pin list",
  )
})

scenario("Given no kv surface at all / When pins are read and toggled / Then the picker still works", () => {
  const api = {}
  assert.deepEqual(pins.readPinnedModels(api), [])
  assert.equal(pins.togglePinnedModel(api, "test/one"), false)
  assert.deepEqual(values(pins.toModelPickerOptions(models, pins.readPinnedModels(api))), [
    "test/one",
    "test/two",
    "other/three",
  ])
})

const workspace = await mkdtemp(join(os.tmpdir(), "amm-pins-"))
const previousHome = process.env.USERPROFILE
const previousHomeFallback = process.env.HOME
const previousOpencode = process.env.OPENCODE_CONFIG

try {
  const directory = join(workspace, "project")
  const configPath = join(directory, "opencode.json")
  await mkdir(directory, { recursive: true })
  await writeFile(
    configPath,
    `${JSON.stringify({ agent: { build: { model: "test/one" } } }, null, 2)}\n`,
    "utf-8",
  )
  process.env.USERPROFILE = join(workspace, "home")
  process.env.HOME = process.env.USERPROFILE
  process.env.OPENCODE_CONFIG = configPath

  // The built bundle, not the source: this half of the contract is about the
  // shipped artifact the host actually loads.
  const module = await import(`${new URL("../dist/tui.js", import.meta.url).href}?v=${Date.now()}`)

  /**
   * A loaded plugin over the same three models the pure scenarios use, in the
   * same order. The shared fixture ships a single model, which is too few to
   * show a pinned row moving ahead of anything, so the provider list is
   * overridden here rather than widened for every other verifier.
   */
  async function openPlugin(pinned) {
    const loaded = createApi(directory, { build: {} }, [])
    // Model keys are bare, like a real provider block: the plugin prefixes them
    // with the provider id to build the value it writes.
    loaded.api.state.config.provider = {
      test: {
        name: "Test",
        models: { one: { name: "One" }, two: { name: "Two" } },
      },
      other: { name: "Other", models: { three: { name: "Three" } } },
    }
    if (pinned !== undefined) loaded.seedKv(STORAGE_KEY, pinned)
    await module.default.tui(loaded.api, undefined, {})
    return loaded
  }

  await asyncScenario("Given a loaded plugin / When its commands are listed / Then /amm-pin is a hidden palette row", async () => {
    const loaded = await openPlugin()
    const pin = loaded.getLayer().commands.find((command) => command.name === "amm-pin")
    assert.equal(typeof pin?.run, "function", "D5: /amm-pin must be registered")
    assert.equal(pin.hidden, true, "D5: /amm-pin must stay out of the palette, which keeps two rows")
    assert.equal(pin.category, "Agent Model Manager")
    assert.equal(pin.slashName, "amm-pin")
  })

  await asyncScenario("Given no pins / When /amm-pin opens / Then every row offers to pin", async () => {
    const loaded = await openPlugin()
    loaded.getLayer().commands.find((command) => command.name === "amm-pin").run()
    const picker = loaded.getReplaceArguments()[0]()
    assert.equal(picker.title, "Pin or unpin a model")
    assert.deepEqual(values(picker.options), ["test/one", "test/two", "other/three"])
    assert.deepEqual(categories(picker.options), [null, null, null])
    for (const option of picker.options) assert.equal(option.description, "Enter to pin")
  })

  await asyncScenario("Given /amm-pin / When a model is picked / Then it is stored and shown in the Pinned group", async () => {
    const loaded = await openPlugin()
    loaded.getLayer().commands.find((command) => command.name === "amm-pin").run()
    loaded.getReplaceArguments()[0]().onSelect({ value: "other/three" })
    assert.deepEqual(loaded.getKv().get(STORAGE_KEY), ["other/three"], "D5: the pick must be persisted")
    const picker = loaded.getReplaceArguments()[0]()
    assert.deepEqual(
      values(picker.options),
      ["other/three", "test/one", "test/two"],
      "D5: the freshly pinned model must lead the re-rendered picker",
    )
    assert.deepEqual(categories(picker.options), [PINNED, null, null])
    assert.equal(picker.options[0].description, `In ${PINNED} · Enter to unpin`)
    assert.equal(picker.options[1].description, "Enter to pin")
  })

  await asyncScenario("Given a pinned model / When the same model is picked again / Then it is unpinned", async () => {
    const loaded = await openPlugin(["other/three"])
    loaded.getLayer().commands.find((command) => command.name === "amm-pin").run()
    loaded.getReplaceArguments()[0]().onSelect({ value: "other/three" })
    assert.deepEqual(loaded.getKv().get(STORAGE_KEY), [])
    assert.deepEqual(categories(loaded.getReplaceArguments()[0]().options), [null, null, null])
  })

  await asyncScenario("Given a pinned model / When a bulk picker opens / Then it leads with the Pinned group", async () => {
    const loaded = await openPlugin(["other/three"])
    loaded.getLayer().commands.find((command) => command.name === "amm-opencode-all").run()
    const picker = loaded.getReplaceArguments()[0]()
    assert.deepEqual(
      values(picker.options),
      ["other/three", "test/one", "test/two"],
      "D5: the shared bulk picker must honour pins too, or the two pickers disagree",
    )
    assert.deepEqual(categories(picker.options), [PINNED, null, null])
  })
} finally {
  if (previousHome === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousHome
  if (previousHomeFallback === undefined) delete process.env.HOME
  else process.env.HOME = previousHomeFallback
  if (previousOpencode === undefined) delete process.env.OPENCODE_CONFIG
  else process.env.OPENCODE_CONFIG = previousOpencode
  await rm(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

console.log("Pinned model contract OK")
