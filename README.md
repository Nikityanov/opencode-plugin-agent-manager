# opencode-agent-model-manager

TUI plugin for [OpenCode](https://opencode.ai) to configure agent/category model assignments in `oh-my-openagent.json`.

## Features

- **Universal** — reads `oh-my-openagent.json` dynamically, no hardcoded agents or categories
- **Slash commands** — `/amm` to configure, `/amm-status` to view current assignments
- **Dialog-based UI** — select agents/categories and assign models via interactive dialogs
- **Preserves config** — writes back to JSON while maintaining structure

## Install

```bash
npm install -g opencode-agent-model-manager
```

Then add to your `opencode.json`:

```json
{
  "plugins": ["opencode-agent-model-manager"]
}
```

Or place in `.opencode/plugins/` for auto-discovery:

```
.opencode/
└── plugins/
    └── opencode-agent-model-manager/
        ├── src/
        │   ├── index.ts
        │   └── tui.tsx
        └── package.json
```

## Usage

### `/amm` — Configure models

Opens a dialog to select an agent or category, then choose a model to assign.

### `/amm-status` — View current assignments

Shows a summary of all current model assignments.

## Configuration

This plugin reads `oh-my-openagent.json` from your project root or parent directories. The file should contain:

```json
{
  "providers": {
    "openrouter": {
      "name": "OpenRouter",
      "id": "openrouter",
      "models": [
        { "id": "anthropic/claude-sonnet-4", "name": "Claude Sonnet 4" }
      ]
    }
  },
  "agents": {
    "sisyphus": { "providerId": "openrouter", "modelId": "anthropic/claude-sonnet-4" }
  },
  "categories": {
    "deep": { "providerId": "openrouter", "modelId": "anthropic/claude-sonnet-4" }
  }
}
```

## Development

```bash
git clone https://github.com/YOUR_USERNAME/opencode-plugin-agent-model-manager.git
cd opencode-plugin-agent-model-manager
npm install
```

Test locally by symlinking:

```bash
npm link
# Then in your project:
# opencode.json: { "plugins": ["opencode-agent-model-manager"] }
```

## License

MIT
