import type { PluginModule } from "@opencode-ai/plugin"

const server: PluginModule["server"] = async () => ({})
const plugin: PluginModule = { server }

export default plugin
