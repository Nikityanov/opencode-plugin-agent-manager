/**
 * Server-side plugin entry.
 * Registers the plugin with OpenCode's server.
 */

import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "opencode-agent-model-manager",
  async setup(ctx) {
    // Log plugin load
    const location = ctx.location.directory
    console.log(`[agent-model-manager] Loaded in ${location}`)

    // Store plugin location for TUI use
    await ctx.storage.set("plugin-dir", location)
  },
})
