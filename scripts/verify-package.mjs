import assert from "node:assert/strict"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { join } from "node:path"
import { createApi } from "./fixture.mjs"

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf-8"))
assert.equal(packageJson.name, "agent-model-manager")
assert.equal(packageJson.exports["./tui"], "./dist/tui.js")
assert.equal(packageJson.main, undefined)
assert.equal(
  packageJson.exports["./server"],
  undefined,
  "package contract: the TUI package must not expose a server export",
)
assert.equal(
  packageJson.scripts?.postinstall,
  undefined,
  "package contract: the package must not define a postinstall hook",
)
assert.equal(
  packageJson.files?.includes("dist/"),
  true,
  "package contract: files must include dist/",
)
assert.equal(
  packageJson.engines?.opencode,
  ">=1.18.0 <2.0.0",
  "package contract: engines.opencode must be >=1.18.0 <2.0.0",
)
assert.equal(
  packageJson.engines?.node,
  ">=20",
  "package contract: engines.node must be >=20",
)

const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf-8")
assert.doesNotMatch(
  gitignore,
  /^[ \t]*dist(?:\/|\*|$)/m,
  "package contract: .gitignore must not ignore dist/",
)

for (const hookName of ["preinstall", "install", "postinstall"]) {
  const command = packageJson.scripts?.[hookName]
  if (command === undefined) continue

  const scriptPath = command.match(
    /(?:^|\s)(?:\.\/)?((?:[\w.-]+\/)*[\w.-]+\.(?:c|m)?js)(?=\s|$)/,
  )?.[1]
  if (scriptPath === undefined) continue

  const normalizedScriptPath = scriptPath.replace(/^\.\//, "").replaceAll("\\", "/")
  await assert.doesNotReject(
    access(new URL(normalizedScriptPath, new URL("../", import.meta.url))),
    `package contract: scripts.${hookName} points to a missing file: ${normalizedScriptPath}`,
  )
  assert.equal(
    packageJson.files?.some((entry) => {
      const normalizedEntry = entry.replace(/^\.\//, "").replace(/\/\*\*?$/, "").replace(/\/$/, "")
      return normalizedScriptPath === normalizedEntry || normalizedScriptPath.startsWith(`${normalizedEntry}/`)
    }),
    true,
    `package contract: scripts.${hookName} points outside files: ${normalizedScriptPath}`,
  )
}

const module = await import(new URL("../dist/tui.js", import.meta.url).href)
assert.equal(typeof module.default, "object")
assert.equal(module.default.id, "agent-model-manager")
assert.equal(typeof module.default.tui, "function")
assert.equal("server" in module.default, false)

const configModule = await import(new URL("../dist/config.js", import.meta.url).href)
assert.equal(typeof configModule.setOpenCodeAgentModels, "function")
assert.equal(typeof configModule.readOpenCodeAgentModels, "function")

const operationsModule = await import(new URL("../dist/operations.js", import.meta.url).href)
assert.equal(typeof operationsModule.applyModelToOhMyEntries, "function")

const statusDialogSource = await readFile(new URL("../src/tui/status-dialog.tsx", import.meta.url), "utf-8")
assert.match(statusDialogSource, /<scrollbox\b/)
assert.doesNotMatch(statusDialogSource, /api\.ui\.Dialog/)
assert.match(
  statusDialogSource,
  /api\.ui\.dialog\.replace[\s\S]*api\.ui\.dialog\.setSize\("large"\)/,
)

const fixtureDirectory = await mkdtemp(join(os.tmpdir(), "agent-model-manager-"))
const modernDirectory = await mkdtemp(join(os.tmpdir(), "agent-model-manager-modern-"))
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
  assert.deepEqual(configModule.readOpenCodeAgentModels(openCodeConfigDirectory), {
    build: "test/model",
    plan: "test/model",
  })

  const modernOmoDirectory = join(modernDirectory, ".omo")
  await mkdir(modernOmoDirectory)
  const modernOmoPath = join(modernOmoDirectory, "omo.jsonc")
  await writeFile(
    modernOmoPath,
    `// preserve this comment
{
  "$schema": "https://example.invalid/omo.schema.json",
  "[opencode]": {
    "agents": { "atlas": { "model": "old/model" } },
    "categories": { "deep": { "model": "old/model" } },
    "runtime_fallback": { "enabled": false }
  }
}
`,
    "utf-8",
  )
  const modernLocation = configModule.findConfig(modernDirectory)
  assert.equal(modernLocation?.path, modernOmoPath)
  assert.equal(modernLocation?.section, "opencode")
  const modernConfig = configModule.readConfig(modernOmoPath)
  assert.equal(modernConfig["[opencode]"].agents.atlas.model, "old/model")
  const updatedModernConfig = JSON.parse(JSON.stringify(modernConfig))
  updatedModernConfig["[opencode]"].agents.atlas.model = "new/model"
  configModule.writeConfig(modernLocation.path, updatedModernConfig, modernLocation.section)
  const modernText = await readFile(modernOmoPath, "utf-8")
  assert.match(modernText, /preserve this comment/)
  assert.match(modernText, /"runtime_fallback"/)
  assert.match(modernText, /"model": "new\/model"/)

  const modernApi = createApi(modernDirectory, {}, ["oh-my-opencode@latest"])
  await module.default.tui(modernApi.api, undefined, {})
  modernApi
    .getLayer()
    .commands.find((command) => command.name === "amm-all-ohmy")
    .run()
  const modelPicker = modernApi.getReplaceArguments()[0]()
  modelPicker.onSelect({ value: "test/model" })
  const bulkConfirmation = modernApi.getReplaceArguments()[0]()
  bulkConfirmation.onConfirm()
  const modernAfterBulk = configModule.readConfig(modernOmoPath)
  for (const name of ["atlas", "hephaestus", "prometheus", "sisyphus"]) {
    assert.equal(modernAfterBulk["[opencode]"].agents[name].model, "test/model")
  }
  for (const name of ["artistry", "deep", "quick"]) {
    assert.equal(modernAfterBulk["[opencode]"].categories[name].model, "test/model")
  }

  const configured = createApi(fixtureDirectory, { build: {} }, ["oh-my-openagent@latest"])
  await module.default.tui(configured.api, undefined, {})
  const configuredNames = configured.getLayer().commands.map((command) => command.name)
  for (const name of ["amm", "amm-all-ohmy", "amm-status", "amm-opencode", "amm-opencode-all"]) {
    assert.equal(configuredNames.includes(name), true)
  }

  // The command layer must stay mode-less. The command palette is itself a
  // dialog, so opening it pushes the host's "modal" mode; a base-scoped command
  // layer would go inactive there and its rows would vanish from the palette.
  assert.equal(
    configured.getLayer().mode,
    undefined,
    "runtime contract: the command layer must not be mode-scoped, or the palette cannot see it",
  )
  const bindingLayer = configured.getBindingLayer()
  assert.equal(bindingLayer.mode, "base", "runtime contract: the binding layer must stay base-scoped")
  assert.deepEqual(
    bindingLayer.bindings.map((binding) => binding.cmd),
    ["amm-ohmy-setup"],
    "runtime contract: ctrl+shift+m must target the available primary setup command",
  )

  configured.getLayer().commands.find((command) => command.name === "amm").run()
  assert.equal(configured.getReplaceArguments()[1], undefined)

  const ohMyStatus = configured.getLayer().commands.find((command) => command.name === "amm-status")
  assert.equal(typeof ohMyStatus?.run, "function")
  ohMyStatus.run()
  assert.equal(typeof configured.getReplaceArguments()[0], "function")

  process.env.USERPROFILE = emptyHomeDirectory
  process.env.HOME = emptyHomeDirectory
  const openCodeOnly = createApi(
    fixtureDirectory,
    { build: { model: "stale/model" }, custom: { model: "stale/model" } },
    [],
  )
  await module.default.tui(openCodeOnly.api, undefined, {})
  const openCodeOnlyNames = openCodeOnly.getLayer().commands.map((command) => command.name)
  assert.equal(openCodeOnlyNames.includes("amm"), false)
  assert.equal(openCodeOnlyNames.includes("amm-all-ohmy"), false)
  assert.equal(openCodeOnlyNames.includes("amm-status"), false)
  assert.equal(openCodeOnlyNames.includes("amm-opencode"), true)
  assert.equal(openCodeOnlyNames.includes("amm-opencode-all"), true)

  const statusCommand = openCodeOnly.getLayer().commands.find(
    (command) => command.name === "amm-opencode-status",
  )
  assert.equal(typeof statusCommand?.run, "function")
  statusCommand.run()
  assert.equal(typeof openCodeOnly.getReplaceArguments()[0], "function")
} finally {
  if (previousHome === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousHome
  if (previousHomeFallback === undefined) delete process.env.HOME
  else process.env.HOME = previousHomeFallback
  await rm(fixtureDirectory, { recursive: true, force: true })
  await rm(modernDirectory, { recursive: true, force: true })
  await rm(emptyHomeDirectory, { recursive: true, force: true })
}

console.log("Package contract OK")
