import { join } from "node:path"

/**
 * Shared host fixture for the runtime verifiers.
 *
 * The plugin reads four things off the host API that a real OpenCode process
 * provides: `api.renderer` dimensions (the wizard derives its list budget from
 * them), `api.state`, `api.keymap.registerLayer`, and `api.ui.dialog`. The
 * fixture supplies just those, and records every registered layer so a caller
 * can address the command layer and the binding layer by role instead of by
 * registration order — the plugin registers them separately on purpose.
 */
export function createApi(directory, agents = {}, plugins = []) {
  const layers = []
  let replaceArguments
  const api = {
    // The wizard derives its list budget from the live renderer dimensions, so
    // the fixture must carry the same `CliRenderer` shape the host provides.
    renderer: { width: 120, height: 44 },
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
        layers.push(value)
        return () => {}
      },
    },
    lifecycle: { onDispose() {} },
    ui: {
      DialogAlert: (props) => props,
      DialogConfirm: (props) => props,
      DialogSelect: (props) => props,
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
  return {
    api,
    getLayer: () => layers.find((layer) => Array.isArray(layer.commands)) ?? layers.at(-1),
    getBindingLayer: () => layers.find((layer) => Array.isArray(layer.bindings)),
    getReplaceArguments: () => replaceArguments,
  }
}
