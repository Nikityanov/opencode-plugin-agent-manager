# Agent Model Manager TUI Design System

## 1. Atmosphere & Identity

A quiet operational command center for changing model assignments without leaving the terminal. The interface is compact, explicit, and fast to scan. The signature is a clear breadcrumb plus a visible selection state: users should always know which scope, section, and target they are editing before a write happens.

The terminal is the visual system. Do not introduce a browser-like card layout, gradients, decorative icons, or motion. Hierarchy comes from spacing, indentation, weight, muted host-theme text, and focus.

## 2. Color

Use the OpenCode/OpenTUI host theme only. Do not add raw colors or a second palette.

| Role | Semantic token | Usage |
| --- | --- | --- |
| Primary text | host primary text | Titles, selected target names, model values |
| Secondary text | host muted text | Breadcrumb context, hints, inherited labels |
| Tertiary text | host disabled/dim text | Shortcuts, empty-state guidance, non-action metadata |
| Focus accent | host selection/focus color | Current row and active keymap target |
| Warning | host warning color | No models, no targets, unsupported state |
| Error | host error color | Persistence failure toast |
| Success | host success color | Applied assignment toast |

Rules:

- Never use color as the only state indicator; pair it with `[x]`, `[ ]`, `>`, or text labels.
- Keep provider/model values readable before dimming the surrounding context.
- Reuse existing toast variants for errors and confirmations.

## 3. Typography

Use the host terminal font and theme; the plugin does not load a font.

| Level | Treatment | Usage |
| --- | --- | --- |
| Dialog title | `TextAttributes.BOLD` | Scope/setup title |
| Section label | bold or host emphasis | `Agents`, `Categories`, `Review` |
| Body row | normal | Target names and model values |
| Metadata | host muted/dim | `[current]`, `[inherited]`, counts, breadcrumbs |
| Footer | host muted/dim | Keyboard shortcuts |

All labels are functional text. No emoji or decorative glyphs.

## 4. Spacing & Layout

Use terminal-cell spacing derived from the existing status dialog.

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | 1 row/cell | Between rows and sections |
| `space-2` | 2 columns | Dialog horizontal padding |
| `indent-1` | 1 section level | Nested target rows |
| `indent-2` | 2 section levels | Model/review metadata |
| `footer-gap` | 1 row | Footer separation |

Layout rules:

- The dialog is a vertical stack: title/breadcrumb, scrollable body, footer.
- The body is the only vertical scroll owner in long target lists.
- Header and footer remain fixed while the body scrolls.
- Prefer a single readable column at narrow widths; do not introduce a side-by-side split.
- `replace()` is followed by `setSize()` for every plugin-owned dialog.
- No nested `api.ui.Dialog` inside `api.ui.dialog.replace()`.

## 5. Components

### `SetupFrame`

- **Structure**: title/breadcrumb row, body slot, fixed footer.
- **Variants**: OpenCode, Oh My OpenAgent, review.
- **Spacing**: `paddingLeft/right = 2`, `gap = 1`.
- **States**: default, no models, no targets, error toast, narrow terminal.
- **Accessibility**: all actions are reachable by keyboard; Escape/Ctrl+C remain host-owned.
- **Motion**: none; logical screens replace content immediately.

### `SetupSectionList`

- **Structure**: ordered section rows with a cursor marker and optional description.
- **Variants**: single-agent, multiple-targets, bulk, review, status.
- **States**: default, focused, selected, disabled/unavailable, empty.
- **Accessibility**: `Up/Down` or `j/k` move focus; Enter opens; Back returns to the previous logical screen.

### `TargetCheckboxList`

- **Structure**: scrollable rows with section label, `[x]/[ ]`, target name, and optional model metadata.
- **Variants**: OpenCode agents, Oh My agents, Oh My categories.
- **States**: unchecked, checked, focused, current, inherited, no selection, long list.
- **Accessibility**: `Space` toggles, `A` selects all, `N` clears, `PageUp/PageDown` scrolls, `Enter` continues only with a non-empty selection.
- **Layout**: the list owns vertical scrolling; the footer stays fixed.

### `ModelPicker`

- **Structure**: OpenCode `DialogSelect` with searchable model values and a visible current marker.
- **States**: default, focused, current model, no models, selection.
- **Accessibility**: uses host DialogSelect search, keyboard navigation, Enter, and Escape.

### `ReviewSummary`

- **Structure**: scope, target list/count, new model, and apply/cancel action.
- **States**: ready, applying, success, error.
- **Accessibility**: no hidden destructive default; user must explicitly apply.

## 6. Motion & Interaction

The TUI is static by design. State changes are immediate and reversible before Apply.

- Focus movement updates the cursor and selected-row treatment immediately.
- Opening a logical screen replaces the previous logical screen; there is no unsupported host-dialog push.
- Escape/Ctrl+C closes the current host dialog.
- Explicit Back returns to the hub or previous logical step.
- No decorative animation, loading spinner, or layout animation is introduced.

## 7. Depth & Surface

Use the host dialog surface and tonal separation.

- Primary dialog surface: host-provided modal surface.
- Nested sections: spacing and dim/bold text, not new card borders.
- Status information: muted metadata labels.
- Focus: one visible row at a time through the host focus/selection treatment.
- Do not add shadows, gradients, or custom borders.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Keyboard-only operation is mandatory.
- Selection state is conveyed by text markers as well as color.
- Long target names and model IDs must not push the footer off the dialog.
- `Escape` and `Ctrl+C` must not be shadowed by plugin keybindings.
- Writes occur only after explicit Apply confirmation.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| No native multi-select API | OpenCode 1.18.x `DialogSelect` | Plugin uses a small custom checkbox list instead of changing OpenCode core | Revisit when host exposes a native multi-select primitive |
| No live visual capture in unit tests | TUI package tests | Host terminal rendering requires a separate runtime check | Cover hub, selection, model, review, and narrow states with TUI QA |
