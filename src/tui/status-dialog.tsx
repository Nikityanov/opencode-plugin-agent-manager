/** @jsxImportSource @opentui/solid */

import { TextAttributes } from "@opentui/core"
import type { TuiApi } from "./model-options"

export function showScrollableStatus(
  api: TuiApi,
  title: string,
  lines: readonly string[],
): void {
  api.ui.dialog.replace(() => {
    return (
      <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1}>
        <box flexDirection="row" justifyContent="space-between">
          <text attributes={TextAttributes.BOLD}>{title}</text>
          <text>esc</text>
        </box>
        <scrollbox
          focused
          maxHeight={24}
          flexShrink={1}
          scrollY={true}
          onKeyDown={(event) => {
            if (event.name === "return") api.ui.dialog.clear()
          }}
        >
          <box flexDirection="column">
            {lines.map((line) => <text>{line}</text>)}
          </box>
        </scrollbox>
        <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <text>up/down, PgUp/PgDn to scroll</text>
          <box paddingLeft={2} paddingRight={2} onMouseUp={() => api.ui.dialog.clear()}>
            <text>ok</text>
          </box>
        </box>
      </box>
    )
  })
  api.ui.dialog.setSize("large")
}
