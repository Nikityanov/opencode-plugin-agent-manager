import type { TuiApi } from "./model-options"

export function showError(api: TuiApi, error: unknown): void {
  api.ui.toast({
    variant: "error",
    title: "Agent Model Manager",
    message: error instanceof Error ? error.message : String(error),
    duration: 5000,
  })
}
