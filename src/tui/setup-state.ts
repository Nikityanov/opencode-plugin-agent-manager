export type SetupPhase = "hub" | "targets" | "model" | "review" | "closed"
export type SetupScope = "opencode" | "oh-my"
export type SetupSection = "agents" | "categories"
export type TargetKind = "agent" | "category"
export type TargetId = `${TargetKind}:${string}`

export type TargetInput = {
  readonly kind: TargetKind
  readonly key: string
}

export type SetupTarget = TargetInput & {
  readonly id: TargetId
}

export type SetupDefinition = {
  readonly targets: readonly TargetInput[]
  readonly models: readonly string[]
}

export type SetupApplyRequest = {
  readonly scope: SetupScope
  readonly section: SetupSection
  readonly targetIds: readonly TargetId[]
  readonly model: string
}

type HubState = {
  readonly phase: "hub"
  readonly scope: SetupScope | null
  readonly section: SetupSection | null
  readonly sectionCursor: number
  readonly availableTargets: readonly SetupTarget[]
  readonly models: readonly string[]
}

type SetupDraft = {
  readonly scope: SetupScope
  readonly section: SetupSection
  readonly availableTargets: readonly SetupTarget[]
  readonly targets: readonly SetupTarget[]
  readonly selectedTargetIds: readonly TargetId[]
  readonly models: readonly string[]
  readonly cursor: number
  readonly modelCursor: number
  readonly reviewCursor: number
  readonly model: string | null
}

export type TargetsState = SetupDraft & { readonly phase: "targets" }
export type ModelState = SetupDraft & { readonly phase: "model" }
export type ReviewState = SetupDraft & { readonly phase: "review" }
export type ClosedState = {
  readonly phase: "closed"
  readonly outcome: "cancelled" | "applied"
  readonly request: SetupApplyRequest | null
}
export type SetupState = HubState | TargetsState | ModelState | ReviewState | ClosedState

export type SetupAction =
  | { readonly type: "select-scope"; readonly scope: SetupScope }
  | { readonly type: "select-section"; readonly section: SetupSection }
  | { readonly type: "move-cursor"; readonly delta: number }
  | { readonly type: "toggle" }
  | { readonly type: "select-all" }
  | { readonly type: "clear-all" }
  | { readonly type: "continue" }
  | { readonly type: "select-model"; readonly model: string }
  | { readonly type: "back" }
  | { readonly type: "cancel" }
  | { readonly type: "apply" }

function assertNever(value: never): never {
  return value
}

export function createTargetId(kind: TargetKind, key: string): TargetId {
  return `${kind}:${key}`
}

export function createSetupTarget(kind: TargetKind, key: string): SetupTarget {
  return { id: createTargetId(kind, key), kind, key }
}

function sectionKind(section: SetupSection): TargetKind {
  switch (section) {
    case "agents":
      return "agent"
    case "categories":
      return "category"
    default:
      return assertNever(section)
  }
}

function clampCursor(cursor: number, length: number): number {
  if (length === 0) return 0
  return Math.max(0, Math.min(length - 1, cursor))
}

export function createInitialSetupState(definition: SetupDefinition): HubState {
  return {
    phase: "hub",
    scope: null,
    section: null,
    sectionCursor: 0,
    availableTargets: definition.targets.map((target) => createSetupTarget(target.kind, target.key)),
    models: [...definition.models],
  }
}

function beginTargets(state: HubState, scope: SetupScope, section: SetupSection): TargetsState {
  const kind = sectionKind(section)
  return {
    phase: "targets",
    scope,
    section,
    availableTargets: state.availableTargets,
    targets: state.availableTargets.filter((target) => target.kind === kind),
    selectedTargetIds: [],
    models: [...state.models],
    cursor: 0,
    modelCursor: 0,
    reviewCursor: 0,
    model: null,
  }
}

function close(outcome: ClosedState["outcome"], request: SetupApplyRequest | null): ClosedState {
  return { phase: "closed", outcome, request }
}

export function canApply(state: SetupState): boolean {
  switch (state.phase) {
    case "review":
      return state.selectedTargetIds.length > 0 && state.model !== null && state.model.length > 0
    case "hub":
    case "targets":
    case "model":
    case "closed":
      return false
    default:
      return assertNever(state)
  }
}

function reduceHub(state: HubState, action: SetupAction): SetupState {
  switch (action.type) {
    case "select-scope":
      return { ...state, scope: action.scope, section: null, sectionCursor: 0 }
    case "select-section":
      if (state.scope === null) return state
      return beginTargets(state, state.scope, action.section)
    case "move-cursor":
      return { ...state, sectionCursor: clampCursor(state.sectionCursor + action.delta, 2) }
    default:
      return state
  }
}

function reduceTargets(state: TargetsState, action: SetupAction): SetupState {
  switch (action.type) {
    case "move-cursor":
      return { ...state, cursor: clampCursor(state.cursor + action.delta, state.targets.length) }
    case "toggle": {
      const target = state.targets[state.cursor]
      if (target === undefined) return state
      const selected = state.selectedTargetIds.includes(target.id)
      return {
        ...state,
        selectedTargetIds: selected
          ? state.selectedTargetIds.filter((id) => id !== target.id)
          : [...state.selectedTargetIds, target.id],
      }
    }
    case "select-all":
      if (state.targets.length === 0) return state
      return { ...state, selectedTargetIds: state.targets.map((target) => target.id) }
    case "clear-all":
      if (state.selectedTargetIds.length === 0) return state
      return { ...state, selectedTargetIds: [] }
    case "continue":
      if (state.selectedTargetIds.length === 0) return state
      return { ...state, phase: "model" }
    default:
      return state
  }
}

function reduceModel(state: ModelState, action: SetupAction): SetupState {
  switch (action.type) {
    case "move-cursor":
      return { ...state, modelCursor: clampCursor(state.modelCursor + action.delta, state.models.length) }
    case "select-model":
      if (action.model.length === 0 || !state.models.includes(action.model)) return state
      return { ...state, phase: "review", model: action.model }
    default:
      return state
  }
}

function reduceReview(state: ReviewState, action: SetupAction): SetupState {
  if (action.type === "move-cursor") {
    // The review cursor walks the *selected* targets, which is a different and
    // usually shorter list than the one the targets screen walked.
    return { ...state, reviewCursor: clampCursor(state.reviewCursor + action.delta, state.selectedTargetIds.length) }
  }
  if (action.type !== "apply" || !canApply(state)) return state
  if (state.model === null) return state
  return close("applied", {
    scope: state.scope,
    section: state.section,
    targetIds: [...state.selectedTargetIds],
    model: state.model,
  })
}

function goBack(state: SetupState): SetupState {
  switch (state.phase) {
    case "targets":
      return {
        phase: "hub",
        scope: state.scope,
        section: state.section,
        sectionCursor: 0,
        availableTargets: state.availableTargets,
        models: state.models,
      }
    case "model":
      return { ...state, phase: "targets" }
    case "review":
      return { ...state, phase: "model" }
    case "hub":
    case "closed":
      return state
    default:
      return assertNever(state)
  }
}

function cancel(state: SetupState): SetupState {
  if (state.phase === "closed") return state
  return close("cancelled", null)
}

function reducePhase(state: SetupState, action: SetupAction): SetupState {
  switch (state.phase) {
    case "hub":
      return reduceHub(state, action)
    case "targets":
      return reduceTargets(state, action)
    case "model":
      return reduceModel(state, action)
    case "review":
      return reduceReview(state, action)
    case "closed":
      return state
    default:
      return assertNever(state)
  }
}

export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "back":
      return goBack(state)
    case "cancel":
      return cancel(state)
    default:
      return reducePhase(state, action)
  }
}
