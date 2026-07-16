export { ConflictWizard } from './ConflictWizard'
export { DiffView } from './DiffView'
export type { DiffViewProps } from './DiffView'
export { MergePreview } from './MergePreview'
export type { MergePreviewProps } from './MergePreview'
export { BatchActions } from './BatchActions'
export type { BatchActionsProps } from './BatchActions'
export type {
  WizardStep,
  ConflictCategory,
  AutoResolutionStrategy,
  CategorizedConflictEntry,
  ConflictResolutionAction,
  AutoResolutionConfig,
  BatchResolveResult,
  ConflictWizardState,
  ConflictWizardAction,
  ConflictWizardProps,
} from './types'
export { computeDiff, isTextFile, groupHunks } from './diff-utils'
export type { DiffHunk, GroupedHunk } from './diff-utils'
