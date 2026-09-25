import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { access, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const REQUIRED_DIST_FILES = ["dist/tui.js", "dist/config.js", "dist/operations.js"]
const INSTALL_MODES = [
  { name: "scripts disabled", directory: "consumer no scripts", ignoreScripts: true },
  { name: "scripts enabled", directory: "consumer with scripts", ignoreScripts: false },
]

const runAsync = promisify(execFile)
const projectDirectory = fileURLToPath(new URL("../", import.meta.url))
const packageJson = JSON.parse(await readFile(join(projectDirectory, "package.json"), "utf-8"))
const packageName = packageJson.name
const isWindows = process.platform === "win32"
const npmCommand = isWindows ? "npm.cmd" : "npm"

// `npm.cmd` is a batch file, so on Windows it must be launched through %ComSpec%.
// Every argument stays a separate argv entry: no shell interpolation, no quoting by hand.
function runNpm(args, options = {}) {
  return runAsync(
    isWindows ? process.env.ComSpec ?? "cmd.exe" : npmCommand,
    isWindows ? ["/d", "/s", "/c", npmCommand, ...args] : args,
    { maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...options },
  )
}

const RESOLVER_SOURCE = `import { createRequire } from "node:module"

const specifier = ${JSON.stringify(`${packageName}/tui`)}
const resolved =
  typeof import.meta.resolve === "function"
    ? await import.meta.resolve(specifier)
    : createRequire(import.meta.url).resolve(specifier)

process.stdout.write(String(resolved))
`

async function resolveTuiExport(consumerDirectory, mode) {
  const resolverPath = join(consumerDirectory, "resolve-tui-export.mjs")
  await writeFile(resolverPath, RESOLVER_SOURCE)
  const { stdout } = await runAsync(process.execPath, [resolverPath], { cwd: consumerDirectory }).catch(
    (error) => {
      const childOutput = String(error.stderr ?? error.message)
      const reason = childOutput.split("\n").find((line) => /^Error\b/.test(line)) ?? childOutput.trim()
      throw new Error(
        `clean install (${mode.name}): ${packageName}/tui could not be resolved from the consumer: ${reason}`,
        { cause: error },
      )
    },
  )
  return fileURLToPath(stdout.trim())
}

const npmCacheDirectory = (await runNpm(["config", "get", "cache"])).stdout.trim()
assert.notEqual(npmCacheDirectory, "", "clean install: npm cache directory must be resolvable")

// Unique per run, and deliberately awkward: spaces and non-ASCII characters must survive
// packing, installing, and module resolution on every platform.
const tempRoot = await mkdtemp(join(os.tmpdir(), "amm install ✓ 测试 "))

try {
  const packOutput = await runNpm(["pack", "--json", "--pack-destination", tempRoot], {
    cwd: projectDirectory,
  })
  const jsonStart = packOutput.stdout.indexOf("[")
  assert.notEqual(jsonStart, -1, `clean install: npm pack --json returned no JSON array\n${packOutput.stdout}`)
  const packEntries = JSON.parse(packOutput.stdout.slice(jsonStart))
  const tarball = Array.isArray(packEntries) ? packEntries[0] : packEntries
  const tarballPath = join(tempRoot, tarball.filename)

  const packedPaths = new Set((tarball.files ?? []).map((entry) => entry.path.replaceAll("\\", "/")))
  for (const requiredFile of REQUIRED_DIST_FILES) {
    assert.ok(
      packedPaths.has(requiredFile),
      `clean install: tarball ${tarball.filename} is missing ${requiredFile}`,
    )
  }
  assert.ok(tarball.entryCount > 0, "clean install: tarball must not be empty")

  for (const mode of INSTALL_MODES) {
    const consumerDirectory = join(tempRoot, mode.directory)
    const homeDirectory = join(tempRoot, `${mode.directory} home`)
    const opencodeConfigDirectory = join(homeDirectory, ".config", "opencode")
    await mkdir(opencodeConfigDirectory, { recursive: true })
    await mkdir(consumerDirectory)
    await writeFile(
      join(consumerDirectory, "package.json"),
      `${JSON.stringify({ name: "amm-smoke-consumer", private: true, version: "0.0.0", type: "module" }, null, 2)}\n`,
    )

    const tuiConfigPath = join(opencodeConfigDirectory, "tui.json")
    const tuiConfigBytes = Buffer.from(
      `${JSON.stringify({ plugin: [packageName], theme: "opencode" }, null, 2)}\n`,
      "utf-8",
    )
    await writeFile(tuiConfigPath, tuiConfigBytes)

    const installArguments = [
      "install",
      tarballPath,
      "--no-audit",
      "--no-fund",
      "--no-progress",
      "--prefer-offline",
      "--cache",
      npmCacheDirectory,
    ]
    if (mode.ignoreScripts) installArguments.push("--ignore-scripts")
    await runNpm(installArguments, {
      cwd: consumerDirectory,
      env: { ...process.env, HOME: homeDirectory, USERPROFILE: homeDirectory },
    }).catch((error) => {
      throw new Error(
        `clean install (${mode.name}): npm install of ${tarball.filename} failed (exit ${error.code ?? "unknown"})`,
        { cause: error },
      )
    })

    const installedPackageDirectory = join(consumerDirectory, "node_modules", packageName)
    for (const requiredFile of REQUIRED_DIST_FILES) {
      await access(join(installedPackageDirectory, ...requiredFile.split("/")))
    }
    const installedManifest = JSON.parse(
      await readFile(join(installedPackageDirectory, "package.json"), "utf-8"),
    )
    assert.equal(
      installedManifest.scripts?.postinstall,
      undefined,
      `clean install (${mode.name}): the published tarball must not ship a postinstall hook`,
    )

    const resolvedPath = await resolveTuiExport(consumerDirectory, mode)
    await access(resolvedPath)
    assert.equal(
      relative(await realpath(consumerDirectory), await realpath(resolvedPath)),
      join("node_modules", packageName, "dist", "tui.js"),
      `clean install (${mode.name}): ${packageName}/tui must resolve to the installed dist/tui.js, got ${resolvedPath}`,
    )

    assert.deepEqual(
      await readFile(tuiConfigPath),
      tuiConfigBytes,
      `clean install (${mode.name}): installing the tarball mutated ${tuiConfigPath}`,
    )
    const homeConfigFiles = (await readdir(homeDirectory, { recursive: true })).filter((entry) =>
      entry.endsWith("tui.json"),
    )
    assert.equal(
      homeConfigFiles.length,
      1,
      `clean install (${mode.name}): install wrote extra tui.json files: ${JSON.stringify(homeConfigFiles)}`,
    )
  }

  console.log(
    `Clean install OK: ${packageName}@${tarball.version} ships ${REQUIRED_DIST_FILES.length} dist files, resolves ${packageName}/tui, installs with scripts disabled and enabled, leaves tui.json untouched`,
  )
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
