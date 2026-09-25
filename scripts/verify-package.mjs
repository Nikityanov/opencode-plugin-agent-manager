import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { join } from "node:path"

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf-8"))
assert.equal(packageJson.name, "agent-model-manager")
assert.equal(packageJson.exports["./tui"], "./dist/tui.js")
assert.equal(packageJson.main, undefined)

const module = await import(new URL("../dist/tui.js", import.meta.url).href)
assert.equal(typeof module.default, "object")
assert.equal(module.default.id, "agent-model-manager")
assert.equal(typeof module.default.tui, "function")
assert.equal("server" in module.default, false)

const configModule = await import(new URL("../dist/config.js", import.meta.url).href)
assert.equal(typeof configModule.setOpenCodeAgentModels, "function")

const operationsModule = await import(new URL("../dist/operations.js", import.meta.url).href)
assert.equal(typeof operationsModule.applyModelToOhMyEntries, "function")

function createApi(directory, agents = {}, plugins = []) {
  let layer
  let replaceArguments
  const api = {
    state: {
      path: { directory, config: join(directory, "opencode.json") },
      config: {
        provider: {
          test: { name: "Test", models: { "test/model": { id: "test/model", name: "Test Model" } } },
        },
        agent: agents,
        plugin: plugins,
      },
      provider: [],
    },
    keymap: {
      registerLayer(value) {
        layer = value
        return () => {}
      },
    },
    lifecycle: { onDispose() {} },
    ui: {
      toast() {},
      dialog: {
        setSize() {},
        replace(...args) {
          replaceArguments = args
        },
        clear() {},
      },
    },
  }
  return { api, getLayer: () => layer, getReplaceArguments: () => replaceArguments }
}

const fixtureDirectory = await mkdtemp(join(os.tmpdir(), "agent-model-manager-"))
const emptyHomeDirectory = await mkdtemp(join(os.tmpdir(), "agent-model-manager-home-"))
const previousHome = process.env.USERPROFILE
const previousHomeFallback = process.env.HOME

try {
  await writeFile(
    join(fixtureDirectory, "oh-my-openagent.json"),
    JSON.stringify({ agents: { test: { model: "test/model" } }, categories: {} }),
    "utf-8",
  )

  const bulkConfig = {
    agents: { first: { model: "old/model", fallback_models: ["fallback/model"] } },
    categories: { writing: { model: "old/model" } },
  }
  assert.equal(operationsModule.applyModelToOhMyEntries(bulkConfig, "new/model"), 2)
  assert.equal(bulkConfig.agents.first.model, "new/model")
  assert.deepEqual(bulkConfig.agents.first.fallback_models, ["fallback/model"])
  assert.equal(bulkConfig.categories.writing.model, "new/model")

  const openCodeConfigDirectory = fixtureDirectory
  const openCodeConfigPath = join(openCodeConfigDirectory, "opencode.json")
  await writeFile(
    openCodeConfigPath,
    JSON.stringify({
      other: { keep: true },
      agent: { build: { mode: "subagent", permissions: { edit: "allow" } } },
    }),
    "utf-8",
  )
  assert.equal(
    configModule.setOpenCodeAgentModels(openCodeConfigDirectory, ["build", "plan"], "test/model"),
    2,
  )
  const updatedOpenCodeConfig = JSON.parse(await readFile(openCodeConfigPath, "utf-8"))
  assert.equal(updatedOpenCodeConfig.other.keep, true)
  assert.equal(updatedOpenCodeConfig.agent.build.model, "test/model")
  assert.equal(updatedOpenCodeConfig.agent.build.mode, "subagent")
  assert.equal(updatedOpenCodeConfig.agent.build.permissions.edit, "allow")
  assert.equal(updatedOpenCodeConfig.agent.plan.model, "test/model")

  const configured = createApi(fixtureDirectory, { build: {} }, ["oh-my-openagent@latest"])
  await module.default.tui(configured.api, undefined, {})
  const configuredNames = configured.getLayer().commands.map((command) => command.name)
  for (const name of ["amm", "amm-all-ohmy", "amm-status", "amm-opencode", "amm-opencode-all"]) {
    assert.equal(configuredNames.includes(name), true)
  }

  configured.getLayer().commands.find((command) => command.name === "amm").run()
  assert.equal(configured.getReplaceArguments()[1], undefined)

  process.env.USERPROFILE = emptyHomeDirectory
  process.env.HOME = emptyHomeDirectory
  const openCodeOnly = createApi(fixtureDirectory, { build: {}, custom: {} }, [])
  await module.default.tui(openCodeOnly.api, undefined, {})
  const openCodeOnlyNames = openCodeOnly.getLayer().commands.map((command) => command.name)
  assert.equal(openCodeOnlyNames.includes("amm"), false)
  assert.equal(openCodeOnlyNames.includes("amm-all-ohmy"), false)
  assert.equal(openCodeOnlyNames.includes("amm-status"), false)
  assert.equal(openCodeOnlyNames.includes("amm-opencode"), true)
  assert.equal(openCodeOnlyNames.includes("amm-opencode-all"), true)
} finally {
  if (previousHome === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousHome
  if (previousHomeFallback === undefined) delete process.env.HOME
  else process.env.HOME = previousHomeFallback
  await rm(fixtureDirectory, { recursive: true, force: true })
  await rm(emptyHomeDirectory, { recursive: true, force: true })
}

console.log("Package contract OK")
