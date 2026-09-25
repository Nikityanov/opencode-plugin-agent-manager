#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const PLUGIN_ID = "agent-model-manager"
const PLUGIN_REF = new URL("../dist/tui.js", import.meta.url).href
const CONFIG_FILENAME = "tui.json"

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function getConfigPath() {
  return path.join(os.homedir(), ".config", "opencode", CONFIG_FILENAME)
}

function main() {
  const configPath = getConfigPath()

  if (!fs.existsSync(configPath)) {
    console.log(`[amm-postinstall] ${CONFIG_FILENAME} not found at ${configPath}, skipping`)
    return
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) {
      throw new Error(`${CONFIG_FILENAME} must contain a JSON object`)
    }

    const plugins = Array.isArray(parsed.plugin)
      ? parsed.plugin.filter((entry) => entry !== PLUGIN_ID)
      : []
    if (!plugins.includes(PLUGIN_REF)) {
      plugins.push(PLUGIN_REF)
      parsed.plugin = plugins
      fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8")
      console.log(`[amm-postinstall] Added ${PLUGIN_REF} to ${configPath}`)
      return
    }

    console.log(`[amm-postinstall] ${PLUGIN_REF} already registered in ${configPath}`)
  } catch (error) {
    console.error(`[amm-postinstall] Error: ${errorMessage(error)}`)
    process.exitCode = 1
  }
}

main()
