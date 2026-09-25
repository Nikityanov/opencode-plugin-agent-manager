# agent-model-manager

TUI plugin for [OpenCode](https://opencode.ai) that edits agent and category model assignments in the active oh-my-openagent configuration.

## Features

- Reads modern `.omo/omo.jsonc` from the project or `~/.omo/`, including the `[opencode]` layer
- Keeps legacy `oh-my-openagent.json[c]` support as a fallback
- Reads available models from the resolved OpenCode configuration
- Exposes exactly two command-palette rows, one per scope, that open the same setup wizard
- Supports one-model bulk updates for each scope, including built-in oh-my agents and categories
- Hides the oh-my palette row when the `oh-my-openagent` package or its configuration is unavailable
- Supports a `Ctrl+Shift+M` shortcut for the primary setup command
- Preserves unrelated configuration fields while changing model assignments

## Requirements

- OpenCode 1.18.x. The package compatibility range is `>=1.18.0 <2.0.0`.
- Node.js 20 or newer and npm for the local clone and build fallback.
- Git for cloning the repository.
- Windows, macOS, and Linux are supported. The GitHub path needs access to GitHub, and the optional npm path needs access to the npm registry.

## Installation

This is a TUI-only package. Register it in `tui.json` or `tui.jsonc`, not in `opencode.json`. OpenCode installs external TUI packages from the `plugin` array in those files.

### Recommended: pinned GitHub tag

Use an immutable GitHub tag in `tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "https://github.com/OWNER/REPO/archive/refs/tags/v0.1.2.tar.gz"
  ]
}
```

Replace `OWNER/REPO` with the real GitHub owner and repository name before saving the file. Do not leave the placeholder in your configuration. Use the GitHub tag archive URL shown above; OpenCode 1.18.x does not reliably prepare `github:OWNER/REPO#TAG` Git dependencies. The bare package name is not a valid pre-publication install path.

The tag must exist and include `dist/tui.js`. The package's `./tui` export points to that file. Package installation does not build the package, so the tracked `dist` directory must be present in the selected tag. OpenCode may install packages with lifecycle scripts disabled. Do not expect installation to create the build.

Choose the file for the scope you want:

| Scope | Configuration file |
| --- | --- |
| Global | `~/.config/opencode/tui.json` |
| Project | `<project>/.opencode/tui.json` |
| JSONC variant | `tui.jsonc` in the global or project directory |

On Windows, `~` refers to your user profile, so the global path is typically `%USERPROFILE%\.config\opencode\tui.json`. Use `tui.jsonc` instead of `tui.json` when you want comments. Keep one TUI config file per scope and put the plugin entry in that file.

As a convenience, install the pinned package and write the global entry with:

```bash
opencode plugin "https://github.com/OWNER/REPO/archive/refs/tags/v0.1.2.tar.gz" --global
```

This command writes the global TUI configuration. For a project-only installation, edit `<project>/.opencode/tui.json` manually instead. After changing the package entry, switching tags, or changing configuration, fully quit and restart OpenCode.

### Clone and build fallback

Use this path when testing a checkout or when the GitHub tag cannot be resolved:

```bash
git clone https://github.com/OWNER/REPO.git agent-model-manager
cd agent-model-manager
npm install
npm run build
```

Replace `OWNER/REPO` with the real repository name. `npm run build` creates `dist/tui.js`; `npm install` alone is not the build step.

From the clone directory, print the file URL that OpenCode should load:

```bash
node --input-type=module -e "import { pathToFileURL } from 'node:url'; import { resolve } from 'node:path'; console.log(pathToFileURL(resolve('.')).href)"
```

Put the printed value in `tui.json` or `tui.jsonc`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "file:///absolute/path/to/agent-model-manager"
  ]
}
```

Use the complete URL printed by the command. The plugin spec must point to the package root, which contains `package.json`; `./tui` then resolves to the package's `dist/tui.js` export. Do not point the plugin spec directly at `dist/tui.js`: the OpenCode plugin installer expects a package root and will look for `dist/package.json`. Windows URLs look like `file:///C:/path/to/agent-model-manager`. macOS and Linux URLs normally look like `file:///home/user/path/to/agent-model-manager`. Fully restart OpenCode after changing the entry.

### Optional npm installation after publication

Do not use the bare `agent-model-manager` spec until the package is actually published to npm. After a release is published, pin the published version. For example, if `0.1.2` is published, use:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "agent-model-manager@0.1.2"
  ]
}
```

The equivalent global convenience command is:

```bash
opencode plugin agent-model-manager@0.1.2 --global
```

Use these npm examples only after the exact version exists on npm. Until then, use the pinned GitHub tag or the clone and build fallback. Installing the package with npm alone does not register it as a TUI plugin; register it through `tui.json`, `tui.jsonc`, or the OpenCode plugin command.

## Development

```bash
npm install
npm test
npm run verify:install
```

`npm test` type-checks the source, builds `dist/tui.js`, and verifies the package export contract. `npm run verify:install` additionally packs the project, installs the tarball with scripts enabled and disabled, resolves the TUI export, and checks that installation does not modify `tui.json`. Neither command registers the plugin in OpenCode. To use the local build, follow the clone and build fallback and register the printed `file://` package-root URL.

## Troubleshooting

### `dist/tui.js` is missing

For a clone, run `npm install` and then `npm run build` from the repository root. For a GitHub tag, confirm that the tag itself contains `dist/tui.js`. Package installation does not create that file, so an incomplete tag cannot be repaired by restarting OpenCode.

### OpenCode still loads an old version

Fully quit OpenCode first. If the same package spec still loads old code, clear the OpenCode cache at `~/.cache/opencode` and restart. On Windows, the usual path is `%USERPROFILE%\.cache\opencode`. This removes all cached packages, not only this plugin. If you use the GitHub path, also confirm that the configured tag is the tag you intended.

### The plugin does not appear

Check that the entry is in the active `tui.json` or `tui.jsonc`, not in `opencode.json`. Check that the global entry is in `~/.config/opencode/tui.json` and the project entry is in `<project>/.opencode/tui.json`. If both files contain an old entry, remove the stale one, then fully restart OpenCode.

OpenCode started with `--pure` does not load external plugins. Start without `--pure` when testing this package. Built-in commands can still appear in pure mode, so their presence does not confirm that this plugin loaded.

### The package version does not match

Confirm that OpenCode is 1.18.x. Confirm that the configured GitHub tag exists, and use the local build path with Node.js 20 or newer when needed. Do not mix a package entry for one release with a checkout from another release. After changing versions or tags, fully restart OpenCode.

### The local path is not loaded

For the clone fallback, point the `plugin` entry to the complete `file://` URL for the package root. The root must contain `package.json`; its `./tui` export points to `dist/tui.js`. Do not use a Windows backslash path, the `dist` directory, or `src/tui.tsx`. Regenerate the URL with the Node command in the fallback section so spaces and Windows drive letters are encoded correctly.

### npm reports that the package is not found

Before npm publication, a bare `agent-model-manager` entry will not resolve. Use the pinned GitHub tag or the clone and build fallback. After publication, use the exact published version, such as `agent-model-manager@0.1.2`, rather than relying on a moving `latest` version.

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

## Command palette

The palette shows exactly two rows, both under the `Agent Model Manager` category:

| Palette row | Slash name | Aliases | Registered when |
| --- | --- | --- | --- |
| `OpenCode agents setup` | `/amm-opencode-setup` | `/amm-opencode` | Always |
| `Oh My OpenAgent setup` | `/amm-ohmy-setup` | `/amm`, `/model-config`, `/agent-config` | An active oh-my-openagent package and configuration are both available |

If the `oh-my-openagent` or legacy `oh-my-opencode` package or its configuration is unavailable, the `Oh My OpenAgent setup` row is not registered at all and `/amm`, `/model-config`, and `/agent-config` stop resolving. The OpenCode row always stays.

`Ctrl+Shift+M` runs the primary row: `Oh My OpenAgent setup` when oh-my is available, otherwise `OpenCode agents setup`. The shortcut is registered in its own keymap layer scoped to the host's `base` mode, so it cannot re-enter while a modal dialog is already open. The commands themselves live in a separate, mode-less layer — the command palette is itself a dialog, so a base-scoped command layer would go inactive exactly when the palette asks it for rows.

## Setup wizard

Both palette rows open the same four-step wizard for their own scope. Nothing is written until the final Apply.

1. **Hub** — pick a section. `Agents` and `Review assignments` for OpenCode; `Agents`, `Categories`, and `Review assignments` for oh-my. `Review assignments` opens the existing read-only status screen for that scope.
2. **Targets** — a checkbox list of every target in the section, annotated with `[current]`, `[inherited]`, and the model each one already has. `Up`/`Down` move one row, `PageUp`/`PageDown` move ten, `Home`/`End` jump to the ends, `Space` toggles the focused row, `a` selects all, `n` clears the selection, `Enter` continues, `Backspace` returns to the hub. `Enter` with an empty selection only shows a warning.
3. **Model** — the searchable model picker, with a `Back` row at the end of the list.
4. **Review** — the scope, the selected targets, and the model that will be written. `Enter` applies and closes the dialog, `Backspace` returns to the model picker. A failed write shows an error toast and leaves the review screen open.

`Escape` and `Ctrl+C` stay owned by the OpenCode host dialog, as before.

The OpenCode scope lists the union of the agents present in the resolved host configuration and the agents already persisted in the config file, and reads a persisted model in preference to the in-state value. The oh-my scope lists the agents and categories already defined in the active configuration, including the built-in names when the config uses the `[opencode]` layer.

## Slash commands

| Slash name | Aliases | Behavior | Palette |
| --- | --- | --- | --- |
| `/amm-opencode-setup` | `/amm-opencode` | OpenCode setup wizard | Visible |
| `/amm-ohmy-setup` | `/amm`, `/model-config`, `/agent-config` | Oh My OpenAgent setup wizard | Visible |
| `/amm-all-ohmy` | — | Apply one model to every oh-my agent and category | Hidden |
| `/amm-status` | — | Show oh-my assignments | Hidden |
| `/amm-opencode-all` | — | Apply one model to all resolved OpenCode agents, including built-ins | Hidden |
| `/amm-opencode-status` | — | Show OpenCode agent models | Hidden |

The legacy bulk and status slash commands are unchanged: same names, same behavior, same handlers. They are only `hidden` so the palette stays focused on the two setup rows. `/amm` and `/amm-opencode` are not separate slash commands any more; they resolve as aliases of the wizard, which supersedes the old one-target-at-a-time dialogs.

## License

MIT
