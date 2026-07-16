/** Wizard step type. */
export type WizardStep = 'overview' | 'category_detail' | 'resolution'

/** Conflict category classification. */
export type ConflictCategory = 'content_conflict' | 'local_deleted' | 'remote_deleted' | 'rename_conflict'

/** Auto-resolution strategy. */
export type AutoResolutionStrategy = 'newer_wins' | 'remote_wins' | 'local_wins' | 'skip'

/** Categorized conflict entry (frontend mirror of backend type). */
export interface CategorizedConflictEntry {
  documentPath: string
  category: ConflictCategory
  localContentHash?: string
  remoteContentHash?: string
  local: { modifiedAt: string; size: number }
  remote: { revision: string; modifiedAt: string; size: number }
  detectedAt: string
}

/** Resolution action type. */
export type ConflictResolutionAction =
  | { type: 'use_remote' }
  | { type: 'use_local' }
  | { type: 'skip' }
  | { type: 'manual_merge'; content: string }

/** Auto-resolution configuration. */
export interface AutoResolutionConfig {
  enabled: boolean
  strategies: Partial<Record<ConflictCategory, AutoResolutionStrategy>>
}

/** Batch resolve result. */
export interface BatchResolveResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ documentPath: string; error: string }>
}

/** Wizard local state (managed via useReducer within ConflictWizard). */
export interface ConflictWizardState {
  step: WizardStep
  selectedCategory: ConflictCategory | null
  selectedConflict: CategorizedConflictEntry | null
  conflicts: CategorizedConflictEntry[]
  resolvedCount: number
  totalCount: number
  checkedPaths: Set<string>
  currentPage: number
  isBatchProcessing: boolean
  batchResult: BatchResolveResult | null
  diffViewMode: 'side-by-side' | 'unified'
  localContent: string | null
  remoteContent: string | null
}

/** Discriminated union of wizard reducer actions. */
export type ConflictWizardAction =
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_CATEGORY'; category: ConflictCategory }
  | { type: 'SET_CONFLICT'; conflict: CategorizedConflictEntry }
  | { type: 'SET_CONFLICTS'; conflicts: CategorizedConflictEntry[] }
  | { type: 'RESOLVE_SUCCESS'; documentPath: string }
  | { type: 'BATCH_START' }
  | { type: 'BATCH_COMPLETE'; result: BatchResolveResult }
  | { type: 'TOGGLE_CHECK'; documentPath: string }
  | { type: 'CHECK_ALL'; paths: string[] }
  | { type: 'UNCHECK_ALL' }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SET_DIFF_MODE'; mode: 'side-by-side' | 'unified' }
  | { type: 'SET_CONTENT'; local: string | null; remote: string | null }
  | { type: 'RESET' }

/** Props for the ConflictWizard component. */
export interface ConflictWizardProps {
  vaultId: string
  onComplete?: () => void
}
