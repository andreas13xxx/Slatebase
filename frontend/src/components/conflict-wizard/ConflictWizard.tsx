import { useReducer, useEffect, useCallback, useState, useRef } from 'react'
import { useTranslation, type TranslateFn, type TranslationKey } from '../../i18n'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { onRealtimeSyncConflict } from '../../state/realtimeSyncBridge'
import { showToast } from '../ToastNotification'
import './ConflictWizard.css'
import type {
  ConflictWizardState,
  ConflictWizardAction,
  ConflictWizardProps,
  CategorizedConflictEntry,
  ConflictCategory,
  BatchResolveResult,
  ConflictResolutionAction,
} from './types'

/** Items per page in category detail view. */
const PAGE_SIZE = 50

/** Maximum batch size for bulk operations. */
const MAX_BATCH_SIZE = 100

/** Category display labels (i18n keys). */
const CATEGORY_LABELS: Record<ConflictCategory, TranslationKey> = {
  content_conflict: 'sync.conflictWizard.categoriesContentConflict',
  local_deleted: 'sync.conflictWizard.categoriesLocalDeleted',
  remote_deleted: 'sync.conflictWizard.categoriesRemoteDeleted',
  rename_conflict: 'sync.conflictWizard.categoriesRenameConflict',
}

/** Default resolution recommendations per category. */
const DEFAULT_RECOMMENDATIONS: Record<ConflictCategory, TranslationKey> = {
  content_conflict: 'sync.conflictWizard.recommendationsContentConflict',
  local_deleted: 'sync.conflictWizard.recommendationsLocalDeleted',
  remote_deleted: 'sync.conflictWizard.recommendationsRemoteDeleted',
  rename_conflict: 'sync.conflictWizard.recommendationsRenameConflict',
}

/** Initial wizard state. */
function createInitialState(): ConflictWizardState {
  return {
    step: 'overview',
    selectedCategory: null,
    selectedConflict: null,
    conflicts: [],
    resolvedCount: 0,
    totalCount: 0,
    checkedPaths: new Set<string>(),
    currentPage: 0,
    isBatchProcessing: false,
    batchResult: null,
    diffViewMode: (localStorage.getItem('slatebase_diff_view_mode') as 'side-by-side' | 'unified') || 'side-by-side',
    localContent: null,
    remoteContent: null,
  }
}

/** Reducer for the conflict wizard local state. */
// eslint-disable-next-line react-refresh/only-export-components
export function conflictWizardReducer(
  state: ConflictWizardState,
  action: ConflictWizardAction,
): ConflictWizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step }
    case 'SET_CATEGORY':
      return {
        ...state,
        selectedCategory: action.category,
        step: 'category_detail',
        currentPage: 0,
        checkedPaths: new Set<string>(),
      }
    case 'SET_CONFLICT':
      return { ...state, selectedConflict: action.conflict, step: 'resolution' }
    case 'SET_CONFLICTS':
      return {
        ...state,
        conflicts: action.conflicts,
        totalCount: action.conflicts.length,
      }
    case 'RESOLVE_SUCCESS': {
      const updated = state.conflicts.filter((c) => c.documentPath !== action.documentPath)
      const newChecked = new Set(state.checkedPaths)
      newChecked.delete(action.documentPath)
      const wasSelected = state.selectedConflict?.documentPath === action.documentPath
      return {
        ...state,
        conflicts: updated,
        resolvedCount: state.resolvedCount + 1,
        checkedPaths: newChecked,
        selectedConflict: wasSelected ? null : state.selectedConflict,
        step: wasSelected ? (state.selectedCategory ? 'category_detail' : 'overview') : state.step,
      }
    }
    case 'BATCH_START':
      return { ...state, isBatchProcessing: true, batchResult: null }
    case 'BATCH_COMPLETE': {
      const succeededPaths = new Set(
        state.conflicts
          .filter((c) => state.checkedPaths.has(c.documentPath))
          .map((c) => c.documentPath)
          .filter((p) => !action.result.errors.some((e) => e.documentPath === p)),
      )
      const remaining = state.conflicts.filter((c) => !succeededPaths.has(c.documentPath))
      const newCheckedBatch = new Set(state.checkedPaths)
      for (const p of succeededPaths) newCheckedBatch.delete(p)
      return {
        ...state,
        isBatchProcessing: false,
        batchResult: action.result,
        conflicts: remaining,
        resolvedCount: state.resolvedCount + action.result.succeeded,
        checkedPaths: newCheckedBatch,
      }
    }
    case 'TOGGLE_CHECK': {
      const next = new Set(state.checkedPaths)
      if (next.has(action.documentPath)) {
        next.delete(action.documentPath)
      } else {
        next.add(action.documentPath)
      }
      return { ...state, checkedPaths: next }
    }
    case 'CHECK_ALL':
      return { ...state, checkedPaths: new Set(action.paths) }
    case 'UNCHECK_ALL':
      return { ...state, checkedPaths: new Set<string>() }
    case 'SET_PAGE':
      return { ...state, currentPage: action.page }
    case 'SET_DIFF_MODE':
      localStorage.setItem('slatebase_diff_view_mode', action.mode)
      return { ...state, diffViewMode: action.mode }
    case 'SET_CONTENT':
      return { ...state, localContent: action.local, remoteContent: action.remote }
    case 'RESET':
      return createInitialState()
    default:
      return state
  }
}

/** Groups conflicts by category. */
function groupByCategory(
  conflicts: CategorizedConflictEntry[],
): Record<ConflictCategory, CategorizedConflictEntry[]> {
  const groups: Record<ConflictCategory, CategorizedConflictEntry[]> = {
    content_conflict: [],
    local_deleted: [],
    remote_deleted: [],
    rename_conflict: [],
  }
  for (const c of conflicts) {
    groups[c.category].push(c)
  }
  return groups
}

/** Formats a file size to human-readable string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Formats an ISO date string to German locale. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE')
}

/**
 * ConflictWizard is the main component orchestrating the 3-step
 * conflict resolution workflow. It uses a local reducer for state
 * management and communicates with the backend via the API client.
 *
 * Steps:
 * 1. Overview - shows categories with badge counts
 * 2. CategoryDetail - shows conflicts for a selected category with pagination
 * 3. Resolution - shows DiffView / MergePreview / action buttons
 */
export function ConflictWizard({ vaultId, onComplete }: ConflictWizardProps) {
  const { t } = useTranslation()
  const { apiClient } = useAppContext()
  const [state, dispatch] = useReducer(conflictWizardReducer, undefined, createInitialState)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // --- Scheduler pause/resume on mount/unmount ---
  useEffect(() => {
    if (!apiClient) return
    apiClient.pauseSyncScheduler(vaultId).catch(() => {
      // Non-critical: log but don't block wizard
    })
    return () => {
      apiClient.resumeSyncScheduler(vaultId).catch(() => {
        // Non-critical: scheduler will resume on next sync
      })
    }
  }, [apiClient, vaultId])

  // --- Load conflicts on mount ---
  useEffect(() => {
    if (!apiClient) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    apiClient
      .getCategorizedConflicts(vaultId)
      .then((conflicts) => {
        if (cancelled) return
        dispatch({ type: 'SET_CONFLICTS', conflicts })
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(extractErrorMessage(err, t('sync.conflictWizard.errorsLoadFailed')))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [apiClient, vaultId, t])

  // --- Subscribe to live sync:conflict SSE events (Req 6.11) ---
  const apiClientRef = useRef(apiClient)
  useEffect(() => { apiClientRef.current = apiClient })
  useEffect(() => {
    const unsubscribe = onRealtimeSyncConflict((event) => {
      // Only handle conflicts for the current vault
      if (event.vaultId !== vaultId) return
      // Refresh the full conflict list from the API to get complete metadata
      const client = apiClientRef.current
      if (!client) return
      client.getCategorizedConflicts(vaultId).then((conflicts) => {
        dispatch({ type: 'SET_CONFLICTS', conflicts })
        showToast('info', t('sync.conflictWizard.newConflictDetected'))
      }).catch(() => {
        // Non-critical: wizard will show stale data until manual refresh
      })
    })
    return unsubscribe
  }, [vaultId, t])

  // --- Navigation handlers ---
  const handleCategoryClick = useCallback((category: ConflictCategory) => {
    dispatch({ type: 'SET_CATEGORY', category })
  }, [])

  const handleConflictClick = useCallback(
    async (conflict: CategorizedConflictEntry) => {
      dispatch({ type: 'SET_CONFLICT', conflict })
      if (!apiClient) return
      // Load file content for diff view
      try {
        const [local, remote] = await Promise.all([
          apiClient.getFileContent(vaultId, conflict.documentPath, 'local'),
          apiClient.getFileContent(vaultId, conflict.documentPath, 'remote'),
        ])
        dispatch({ type: 'SET_CONTENT', local, remote })
      } catch (_err) {
        dispatch({ type: 'SET_CONTENT', local: null, remote: null })
      }
    },
    [apiClient, vaultId],
  )

  const handleBackToOverview = useCallback(() => {
    dispatch({ type: 'SET_STEP', step: 'overview' })
  }, [])

  const handleBackToCategory = useCallback(() => {
    if (state.selectedCategory) {
      dispatch({ type: 'SET_STEP', step: 'category_detail' })
    } else {
      dispatch({ type: 'SET_STEP', step: 'overview' })
    }
  }, [state.selectedCategory])

  // --- Resolution handlers ---
  const handleResolve = useCallback(
    async (documentPath: string, resolution: ConflictResolutionAction) => {
      if (!apiClient) return
      try {
        if (resolution.type === 'manual_merge') {
          await apiClient.resolveConflictMerge(vaultId, documentPath, resolution.content)
        } else {
          await apiClient.resolveConflictBatch(vaultId, [{ documentPath, resolution }])
        }
        dispatch({ type: 'RESOLVE_SUCCESS', documentPath })
      } catch (err) {
        setError(extractErrorMessage(err, t('sync.conflictWizard.errorsResolveFailed')))
      }
    },
    [apiClient, vaultId, t],
  )

  const handleBatchResolve = useCallback(
    async (resolution: ConflictResolutionAction) => {
      if (!apiClient) return
      const paths = Array.from(state.checkedPaths)
      if (paths.length === 0) return
      if (paths.length > MAX_BATCH_SIZE) {
        setError(t('sync.conflictWizard.batchLimitExceeded'))
        return
      }

      dispatch({ type: 'BATCH_START' })
      try {
        const resolutions = paths.map((documentPath) => ({ documentPath, resolution }))
        const result = await apiClient.resolveConflictBatch(vaultId, resolutions)
        dispatch({ type: 'BATCH_COMPLETE', result })
      } catch (err) {
        const fallbackResult: BatchResolveResult = {
          total: paths.length,
          succeeded: 0,
          failed: paths.length,
          errors: [{ documentPath: '*', error: extractErrorMessage(err, t('sync.conflictWizard.batchError')) }],
        }
        dispatch({ type: 'BATCH_COMPLETE', result: fallbackResult })
      }
    },
    [apiClient, vaultId, state.checkedPaths, t],
  )

  const handleResolveAllCategory = useCallback(
    async (category: ConflictCategory) => {
      if (!apiClient) return
      const categoryConflicts = state.conflicts.filter((c) => c.category === category)
      if (categoryConflicts.length === 0) return
      if (categoryConflicts.length > MAX_BATCH_SIZE) {
        setError(t('sync.conflictWizard.batchLimitExceeded'))
        return
      }

      // Use default recommendation for the category
      const resolution: ConflictResolutionAction = getDefaultResolution(category)
      dispatch({ type: 'BATCH_START' })
      try {
        const resolutions = categoryConflicts.map((c) => ({
          documentPath: c.documentPath,
          resolution,
        }))
        const result = await apiClient.resolveConflictBatch(vaultId, resolutions)
        dispatch({ type: 'BATCH_COMPLETE', result })
      } catch (err) {
        const fallbackResult: BatchResolveResult = {
          total: categoryConflicts.length,
          succeeded: 0,
          failed: categoryConflicts.length,
          errors: [{ documentPath: '*', error: extractErrorMessage(err, t('sync.conflictWizard.batchError')) }],
        }
        dispatch({ type: 'BATCH_COMPLETE', result: fallbackResult })
      }
    },
    [apiClient, vaultId, state.conflicts, t],
  )

  const handleResumeSyncAndComplete = useCallback(async () => {
    if (apiClient) {
      await apiClient.resumeSyncScheduler(vaultId).catch(() => {})
    }
    onComplete?.()
  }, [apiClient, vaultId, onComplete])

  // --- Computed values ---
  const groups = groupByCategory(state.conflicts)
  const isAllResolved = state.conflicts.length === 0 && state.totalCount > 0

  // --- Loading state ---
  if (loading) {
    return (
      <div className="conflict-wizard conflict-wizard--loading">
        <p>{t('sync.conflictWizard.loading')}</p>
      </div>
    )
  }

  // --- Error state ---
  if (error && state.conflicts.length === 0) {
    return (
      <div className="conflict-wizard conflict-wizard--error">
        <p className="conflict-wizard__error">{error}</p>
      </div>
    )
  }

  // --- All resolved / completion ---
  if (isAllResolved) {
    return (
      <div className="conflict-wizard conflict-wizard--complete">
        <h2 className="conflict-wizard__title">
          {t('sync.conflictWizard.completionTitle')}
        </h2>
        <p className="conflict-wizard__summary">
          {t('sync.conflictWizard.completionSummary', {
            count: String(state.resolvedCount),
          })}
        </p>
        <button
          className="conflict-wizard__btn conflict-wizard__btn--primary"
          onClick={handleResumeSyncAndComplete}
        >
          {t('sync.conflictWizard.resumeSync')}
        </button>
      </div>
    )
  }

  // --- Progress indicator ---
  const progressText = `${state.resolvedCount}/${state.totalCount} ${t('sync.conflictWizard.conflictsResolved')}`

  return (
    <div className="conflict-wizard">
      {/* Progress header */}
      <div className="conflict-wizard__header">
        <h2 className="conflict-wizard__title">
          {t('sync.conflictWizard.title')}
        </h2>
        <span className="conflict-wizard__progress">{progressText}</span>
      </div>

      {/* Error toast */}
      {error && (
        <div className="conflict-wizard__error-banner">
          <span>{error}</span>
          <button
            className="conflict-wizard__error-dismiss"
            onClick={() => setError(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* Batch result feedback */}
      {state.batchResult && (
        <div className="conflict-wizard__batch-result">
          <p>
            {t('sync.conflictWizard.batchResultSuccess', {
              count: String(state.batchResult.succeeded),
            })}
          </p>
          {state.batchResult.failed > 0 && (
            <p className="conflict-wizard__batch-result--failed">
              {t('sync.conflictWizard.batchResultFailed', {
                count: String(state.batchResult.failed),
              })}
            </p>
          )}
        </div>
      )}

      {/* Step 1: Overview */}
      {state.step === 'overview' && (
        <WizardOverview
          groups={groups}
          onCategoryClick={handleCategoryClick}
          onResolveAll={handleResolveAllCategory}
          isBatchProcessing={state.isBatchProcessing}
          t={t}
        />
      )}

      {/* Step 2: Category Detail */}
      {state.step === 'category_detail' && state.selectedCategory && (
        <WizardCategoryDetail
          category={state.selectedCategory}
          conflicts={groups[state.selectedCategory] ?? []}
          checkedPaths={state.checkedPaths}
          currentPage={state.currentPage}
          isBatchProcessing={state.isBatchProcessing}
          onConflictClick={handleConflictClick}
          onToggleCheck={(path) => dispatch({ type: 'TOGGLE_CHECK', documentPath: path })}
          onCheckAll={(paths) => dispatch({ type: 'CHECK_ALL', paths })}
          onUncheckAll={() => dispatch({ type: 'UNCHECK_ALL' })}
          onSetPage={(page) => dispatch({ type: 'SET_PAGE', page })}
          onBatchResolve={handleBatchResolve}
          onBack={handleBackToOverview}
          t={t}
        />
      )}

      {/* Step 3: Resolution */}
      {state.step === 'resolution' && state.selectedConflict && (
        <WizardResolution
          conflict={state.selectedConflict}
          localContent={state.localContent}
          remoteContent={state.remoteContent}
          diffViewMode={state.diffViewMode}
          onResolve={handleResolve}
          onSetDiffMode={(mode) => dispatch({ type: 'SET_DIFF_MODE', mode })}
          onBack={handleBackToCategory}
          t={t}
        />
      )}
    </div>
  )
}

/** Returns the default resolution action for a category. */
function getDefaultResolution(category: ConflictCategory): ConflictResolutionAction {
  switch (category) {
    case 'content_conflict':
      // "Neuere Version" → use_remote as safe default
      return { type: 'use_remote' }
    case 'local_deleted':
      return { type: 'use_remote' }
    case 'remote_deleted':
      return { type: 'use_local' }
    case 'rename_conflict':
      return { type: 'use_remote' }
  }
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

/** Translate function type (compatible with useTranslation output). */
type TFn = TranslateFn

interface WizardOverviewProps {
  groups: Record<ConflictCategory, CategorizedConflictEntry[]>
  onCategoryClick: (category: ConflictCategory) => void
  onResolveAll: (category: ConflictCategory) => void
  isBatchProcessing: boolean
  t: TFn
}

/** Step 1: Overview showing categories with badges and "Alle auflösen" per category. */
function WizardOverview({ groups, onCategoryClick, onResolveAll, isBatchProcessing, t }: WizardOverviewProps) {
  const categories: ConflictCategory[] = ['content_conflict', 'local_deleted', 'remote_deleted', 'rename_conflict']

  return (
    <div className="conflict-wizard__overview">
      <ul className="conflict-wizard__category-list">
        {categories.map((category) => {
          const count = groups[category].length
          if (count === 0) return null
          return (
            <li key={category} className="conflict-wizard__category-item">
              <button
                className="conflict-wizard__category-btn"
                onClick={() => onCategoryClick(category)}
              >
                <span className="conflict-wizard__category-label">
                  {t(CATEGORY_LABELS[category])}
                </span>
                <span className="conflict-wizard__category-badge">{count}</span>
              </button>
              <span className="conflict-wizard__category-recommendation">
                {t(DEFAULT_RECOMMENDATIONS[category])}
              </span>
              <button
                className="conflict-wizard__btn conflict-wizard__btn--secondary"
                disabled={isBatchProcessing}
                onClick={(e) => {
                  e.stopPropagation()
                  onResolveAll(category)
                }}
              >
                {t('sync.conflictWizard.resolveAll')}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface WizardCategoryDetailProps {
  category: ConflictCategory
  conflicts: CategorizedConflictEntry[]
  checkedPaths: Set<string>
  currentPage: number
  isBatchProcessing: boolean
  onConflictClick: (conflict: CategorizedConflictEntry) => void
  onToggleCheck: (path: string) => void
  onCheckAll: (paths: string[]) => void
  onUncheckAll: () => void
  onSetPage: (page: number) => void
  onBatchResolve: (resolution: ConflictResolutionAction) => void
  onBack: () => void
  t: TFn
}

/** Step 2: Conflict list for a single category with checkboxes and pagination. */
function WizardCategoryDetail({
  category,
  conflicts,
  checkedPaths,
  currentPage,
  isBatchProcessing,
  onConflictClick,
  onToggleCheck,
  onCheckAll,
  onUncheckAll,
  onSetPage,
  onBatchResolve,
  onBack,
  t,
}: WizardCategoryDetailProps) {
  const totalPages = Math.ceil(conflicts.length / PAGE_SIZE)
  const pageStart = currentPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, conflicts.length)
  const pageConflicts = conflicts.slice(pageStart, pageEnd)
  const allPageChecked = pageConflicts.every((c) => checkedPaths.has(c.documentPath))
  const checkedCount = checkedPaths.size

  return (
    <div className="conflict-wizard__category-detail">
      {/* Header with back button */}
      <div className="conflict-wizard__detail-header">
        <button className="conflict-wizard__btn conflict-wizard__btn--back" onClick={onBack}>
          {t('sync.conflictWizard.back')}
        </button>
        <h3 className="conflict-wizard__detail-title">
          {t(CATEGORY_LABELS[category])} ({conflicts.length})
        </h3>
      </div>

      {/* Batch actions toolbar */}
      {checkedCount > 0 && (
        <div className="conflict-wizard__batch-toolbar">
          <span>
            {t('sync.conflictWizard.selectedCount', { count: String(checkedCount) })}
          </span>
          {checkedCount > MAX_BATCH_SIZE && (
            <span className="conflict-wizard__batch-warning">
              {t('sync.conflictWizard.batchLimitExceeded')}
            </span>
          )}
          <button
            className="conflict-wizard__btn conflict-wizard__btn--primary"
            disabled={isBatchProcessing || checkedCount > MAX_BATCH_SIZE}
            onClick={() => onBatchResolve(getDefaultResolution(category))}
          >
            {isBatchProcessing
              ? t('sync.conflictWizard.processing')
              : t('sync.conflictWizard.resolveSelected')}
          </button>
          <button
            className="conflict-wizard__btn conflict-wizard__btn--secondary"
            onClick={onUncheckAll}
          >
            {t('sync.conflictWizard.deselectAll')}
          </button>
        </div>
      )}

      {/* Select all checkbox */}
      <div className="conflict-wizard__select-all">
        <label className="conflict-wizard__checkbox-label">
          <input
            type="checkbox"
            checked={allPageChecked && pageConflicts.length > 0}
            onChange={() => {
              if (allPageChecked) {
                onUncheckAll()
              } else {
                onCheckAll(pageConflicts.map((c) => c.documentPath))
              }
            }}
          />
          {t('sync.conflictWizard.selectAll')}
        </label>
      </div>

      {/* Conflict list */}
      <ul className="conflict-wizard__conflict-list">
        {pageConflicts.map((conflict) => (
          <li key={conflict.documentPath} className="conflict-wizard__conflict-item">
            <label className="conflict-wizard__checkbox-label">
              <input
                type="checkbox"
                checked={checkedPaths.has(conflict.documentPath)}
                onChange={() => onToggleCheck(conflict.documentPath)}
              />
            </label>
            <button
              className="conflict-wizard__conflict-btn"
              onClick={() => onConflictClick(conflict)}
            >
              <span className="conflict-wizard__conflict-path">
                {conflict.documentPath}
              </span>
              <span className="conflict-wizard__conflict-meta">
                {formatSize(conflict.local.size)} / {formatDate(conflict.local.modifiedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="conflict-wizard__pagination">
          <button
            className="conflict-wizard__btn conflict-wizard__btn--secondary"
            disabled={currentPage === 0}
            onClick={() => onSetPage(currentPage - 1)}
          >
            {t('sync.conflictWizard.previousPage')}
          </button>
          <span className="conflict-wizard__page-info">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            className="conflict-wizard__btn conflict-wizard__btn--secondary"
            disabled={currentPage >= totalPages - 1}
            onClick={() => onSetPage(currentPage + 1)}
          >
            {t('sync.conflictWizard.nextPage')}
          </button>
        </div>
      )}
    </div>
  )
}

interface WizardResolutionProps {
  conflict: CategorizedConflictEntry
  localContent: string | null
  remoteContent: string | null
  diffViewMode: 'side-by-side' | 'unified'
  onResolve: (documentPath: string, resolution: ConflictResolutionAction) => void
  onSetDiffMode: (mode: 'side-by-side' | 'unified') => void
  onBack: () => void
  t: TFn
}

/** Step 3: Resolution view with diff/merge/action buttons. */
function WizardResolution({
  conflict,
  localContent,
  remoteContent,
  diffViewMode,
  onResolve,
  onSetDiffMode,
  onBack,
  t,
}: WizardResolutionProps) {
  return (
    <div className="conflict-wizard__resolution">
      {/* Header with back button */}
      <div className="conflict-wizard__resolution-header">
        <button className="conflict-wizard__btn conflict-wizard__btn--back" onClick={onBack}>
          {t('sync.conflictWizard.back')}
        </button>
        <h3 className="conflict-wizard__resolution-title">
          {conflict.documentPath}
        </h3>
      </div>

      {/* File metadata */}
      <div className="conflict-wizard__resolution-meta">
        <div className="conflict-wizard__meta-local">
          <strong>{t('sync.conflictWizard.localVersion')}</strong>
          <span>{formatSize(conflict.local.size)}</span>
          <span>{formatDate(conflict.local.modifiedAt)}</span>
        </div>
        <div className="conflict-wizard__meta-remote">
          <strong>{t('sync.conflictWizard.remoteVersion')}</strong>
          <span>{formatSize(conflict.remote.size)}</span>
          <span>{formatDate(conflict.remote.modifiedAt)}</span>
        </div>
      </div>

      {/* Diff view mode toggle */}
      {conflict.category === 'content_conflict' && localContent !== null && remoteContent !== null && (
        <div className="conflict-wizard__diff-controls">
          <button
            className={`conflict-wizard__btn ${diffViewMode === 'side-by-side' ? 'conflict-wizard__btn--active' : 'conflict-wizard__btn--secondary'}`}
            onClick={() => onSetDiffMode('side-by-side')}
          >
            {t('sync.conflictWizard.sideBySide')}
          </button>
          <button
            className={`conflict-wizard__btn ${diffViewMode === 'unified' ? 'conflict-wizard__btn--active' : 'conflict-wizard__btn--secondary'}`}
            onClick={() => onSetDiffMode('unified')}
          >
            {t('sync.conflictWizard.unified')}
          </button>
        </div>
      )}

      {/* DiffView placeholder — will be implemented in task 12.1 */}
      {conflict.category === 'content_conflict' && localContent !== null && remoteContent !== null && (
        <div className="conflict-wizard__diff-placeholder">
          {/* TODO: Replace with DiffView component (task 12.1) */}
          <pre className="conflict-wizard__diff-preview">
            {t('sync.conflictWizard.diffPlaceholder')}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      <div className="conflict-wizard__resolution-actions">
        <button
          className="conflict-wizard__btn conflict-wizard__btn--primary"
          onClick={() => onResolve(conflict.documentPath, { type: 'use_local' })}
        >
          {t('sync.conflictWizard.useLocal')}
        </button>
        <button
          className="conflict-wizard__btn conflict-wizard__btn--primary"
          onClick={() => onResolve(conflict.documentPath, { type: 'use_remote' })}
        >
          {t('sync.conflictWizard.useRemote')}
        </button>
        <button
          className="conflict-wizard__btn conflict-wizard__btn--secondary"
          onClick={() => onResolve(conflict.documentPath, { type: 'skip' })}
        >
          {t('sync.conflictWizard.skip')}
        </button>
      </div>
    </div>
  )
}
