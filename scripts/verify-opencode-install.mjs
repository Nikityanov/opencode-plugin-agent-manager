import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import { delimiter, extname, join } from "node:path"
import { promisify } from "node:util"

const runAsync = promisify(execFile)
const suppliedSpec = process.argv[2] ?? process.env.PLUGIN_SPEC
const pluginSpec = typeof suppliedSpec === "string" ? suppliedSpec.trim() : ""

assert.ok(
  pluginSpec.length > 0,
  "OpenCode install smoke: pass a plugin spec as argv[2] or set PLUGIN_SPEC",
)

const executableNames =
  process.platform === "win32"
    ? ["opencode.exe", "opencode.cmd", "opencode.bat", "opencode"]
    : ["opencode", "opencode.exe"]

function pathEntries() {
  const pathValue = process.env.PATH ?? process.env.Path ?? ""
  return pathValue
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter((entry) => entry.length > 0)
}

async function isExecutable(candidate) {
  try {
    const file = await stat(candidate)
    if (!file.isFile()) return false
    if (process.platform !== "win32") await access(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function findOpencode() {
  for (const directory of pathEntries()) {
    for (const executableName of executableNames) {
      const candidate = join(directory, executableName)
      if (await isExecutable(candidate)) return candidate
    }
  }

  throw new Error(
    `OpenCode install smoke: could not find opencode${process.platform === "win32" ? ".exe" : ""} on PATH`,
  )
}

function commandInvocation(candidate, args) {
  const extension = extname(candidate).toLowerCase()
  if (process.platform === "win32" && [".cmd", ".bat", ""].includes(extension)) {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", candidate, ...args],
    }
  }
  return { command: candidate, args }
}

function failureOutput(error) {
  return [error?.stdout, error?.stderr]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim()
}

const opencodeExecutable = await findOpencode()
const tempRoot = await mkdtemp(join(os.tmpdir(), "opencode-install-"))

try {
  const homeDirectory = join(tempRoot, "home")
  const xdgConfigHome = join(homeDirectory, ".config")
  const xdgDataHome = join(homeDirectory, ".local", "share")
  const xdgStateHome = join(homeDirectory, ".local", "state")
  const xdgCacheHome = join(homeDirectory, ".cache")
  const xdgRuntimeHome = join(homeDirectory, ".local", "run")
  const configDirectory = join(xdgConfigHome, "opencode")
  const tuiConfigPath = join(configDirectory, "tui.json")
  const opencodeConfigPath = join(configDirectory, "opencode.json")
  const appDataDirectory = join(homeDirectory, "AppData", "Roaming")
  const localAppDataDirectory = join(homeDirectory, "AppData", "Local")

  await Promise.all(
    [
      homeDirectory,
      configDirectory,
      xdgDataHome,
      xdgStateHome,
      xdgCacheHome,
      xdgRuntimeHome,
      appDataDirectory,
      localAppDataDirectory,
    ].map((directory) => mkdir(directory, { recursive: true })),
  )
  await Promise.all([
    writeFile(tuiConfigPath, `${JSON.stringify({ plugin: [] }, null, 2)}\n`, "utf-8"),
    writeFile(opencodeConfigPath, "{}\n", "utf-8"),
  ])

  const env = {
    ...process.env,
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_DATA_HOME: xdgDataHome,
    XDG_STATE_HOME: xdgStateHome,
    XDG_CACHE_HOME: xdgCacheHome,
    XDG_RUNTIME_DIR: xdgRuntimeHome,
    OPENCODE_CONFIG: opencodeConfigPath,
    OPENCODE_TUI_CONFIG: tuiConfigPath,
    OPENCODE_DB: join(homeDirectory, "opencode.db"),
  }
  if (process.platform === "win32") {
    env.APPDATA = appDataDirectory
    env.LOCALAPPDATA = localAppDataDirectory
  }

  const invocation = commandInvocation(opencodeExecutable, ["plugin", pluginSpec, "--global"])
  try {
    await runAsync(invocation.command, invocation.args, {
      cwd: tempRoot,
      env,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (error) {
    const output = failureOutput(error)
    throw new Error(
      `OpenCode install smoke: \`opencode plugin ${pluginSpec} --global\` failed${
        output.length > 0 ? `:\n${output}` : ""
      }`,
      { cause: error },
    )
  }

  let config
  try {
    config = JSON.parse(await readFile(tuiConfigPath, "utf-8"))
  } catch (error) {
    throw new Error(`OpenCode install smoke: missing or invalid isolated tui.json at ${tuiConfigPath}`, {
      cause: error,
    })
  }

  const pluginEntries = config?.plugin
  assert.ok(
    Array.isArray(pluginEntries),
    `OpenCode install smoke: isolated tui.json has no plugin array: ${JSON.stringify(config)}`,
  )
  const installedSpecs = pluginEntries.map((entry) => (Array.isArray(entry) ? entry[0] : entry))
  assert.ok(
    installedSpecs.includes(pluginSpec),
    `OpenCode install smoke: exact spec ${JSON.stringify(pluginSpec)} was not written to isolated tui.json; found ${JSON.stringify(installedSpecs)}`,
  )

  console.log(`OpenCode install OK: ${pluginSpec} is registered in isolated ${tuiConfigPath}`)
} finally {
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
