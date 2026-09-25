# agent-model-manager

TUI plugin for [OpenCode](https://opencode.ai) that edits agent and category model assignments in the active oh-my-openagent configuration.

## Features

- Reads modern `.omo/omo.jsonc` from the project or `~/.omo/`, including the `[opencode]` layer
- Keeps legacy `oh-my-openagent.json[c]` support as a fallback
- Reads available models from the resolved OpenCode configuration
- Adds separate controls for oh-my agents/categories and OpenCode agents
- Supports one-model bulk updates for each scope, including built-in oh-my agents and categories
- Hides oh-my commands when the `oh-my-openagent` package or its configuration is unavailable
- Supports a `Ctrl+Shift+M` shortcut for the primary configuration command
- Preserves unrelated configuration fields while changing model assignments

## OpenCode 1.18.x registration

This is a TUI-only plugin. Register it in `tui.json`, not in `opencode.json`:

```json
{
  "plugin": ["agent-model-manager"]
}
```

Global config path:

```text
~/.config/opencode/tui.json
```

After changing plugin files or configuration, fully restart OpenCode.

## Development

```bash
npm install
npm test
```

`npm test` type-checks the source, builds `dist/tui.js`, and verifies the package export contract.

To use the local build, install or link this package so OpenCode can resolve the `agent-model-manager` package name, then keep the `tui.json` entry above.

## Configuration shape

For modern oh-my-openagent configuration, the plugin edits model overrides in the `[opencode]` layer:

```jsonc
{
  "[opencode]": {
    "agents": {
      "sisyphus": { "model": "opencode-go/deepseek-v4-flash" }
    },
    "categories": {
      "deep": { "model": "opencode-go/deepseek-v4-flash" }
    }
  }
}
```

Legacy root-level `agents` and `categories` remain supported for older installations.

## Commands

When an active `.omo/omo.jsonc` or legacy `oh-my-openagent.json[c]` configuration is present:

- `/amm` — configure one oh-my agent or category
- `/amm-all-ohmy` — apply one model to every oh-my agent and category
- `/amm-status` — show oh-my assignments

OpenCode agent commands are always available:

- `/amm-opencode` — configure one OpenCode agent
- `/amm-opencode-all` — apply one model to all resolved OpenCode agents, including built-ins
- `/amm-opencode-status` — show OpenCode agent models

If neither the `oh-my-openagent` nor legacy `oh-my-opencode` package/configuration is available, the oh-my commands are omitted and only OpenCode commands remain.

## License

MIT
