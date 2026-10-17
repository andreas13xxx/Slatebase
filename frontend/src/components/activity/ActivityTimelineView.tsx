/**
 * ActivityTimelineView — chronological view of recorded vault activity.
 *
 * One component, two variants:
 *  - `full`    → the file tab (sentinel `__view::activity`), roomier layout
 *  - `compact` → a sidebar panel view
 *
 * Events are grouped into time buckets (Today / Yesterday / This week / Older),
 * filterable by lane chips (only lanes with events show), and clickable to open
 * the file. Live-refreshes on `vault:change`. Loading/empty/error states carry
 * the appropriate ARIA roles.
 */

import React, { useReducer, useEffect, useCallback, useMemo } from 'react'
import { History } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import { useAppContext } from '../../state'
import type { ActivityEvent, ActivityEventType } from '../../types'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import {
  activityReducer,
  createInitialActivityState,
  DEFAULT_ACTIVITY_RANGE,
  type ActivityRange,
} from '../../state/activityState'
import { loadActivity, loadMoreActivity, refreshRecentActivity } from '../../state/activityActions'
import { useVaultSetting, updateVaultSettings } from '../../state/vaultSettingsStore'
import { groupIntoTimeBuckets } from './time-buckets'
import {
  ACTIVITY_EVENT_META,
  typesForLane,
  laneLabelKey,
  originBadgeMeta,
  type ActivityLane,
} from './activity-event-meta'
import { ActivityStatPanel } from './ActivityStatPanel'
import './ActivityTimelineView.css'

export interface ActivityTimelineViewProps {
  /** Opens a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
  /** `full` for the tab, `compact` for the sidebar. */
  variant: 'full' | 'compact'
}

const ALL_LANES: ActivityLane[] = ['notes', 'canvas', 'bases', 'snippets', 'sync']

const VALID_RANGES: ActivityRange[] = ['day', 'week', 'month', 'year']

/** Collect every directory path in a vault tree, sorted, for the folder filter. */
function collectFolderPaths(tree: import('../../types').DirectoryTree | null): string[] {
  if (!tree) return []
  const out: string[] = []
  const walk = (node: import('../../types').DirectoryTree): void => {
    for (const child of node.children ?? []) {
      if (child.type === 'directory') {
        // Skip hidden (dot-prefixed) folders, matching the vault's visibility rule.
        if (!child.name.startsWith('.')) out.push(child.path)
        walk(child)
      }
    }
  }
  walk(tree)
  return out.sort((a, b) => a.localeCompare(b))
}

/** Relative-time formatter, matching the sidebar views' style. */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Gerade eben'
  if (minutes < 60) return `Vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Gestern'
  if (days < 7) return `Vor ${days} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** Last path segment, for display. */
function fileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

export function ActivityTimelineView({ onOpenFile, variant }: ActivityTimelineViewProps): React.ReactElement {
  const { t } = useTranslation()
  const { apiClient, state: appState } = useAppContext()
  const vaultId = appState.selectedVaultId
  const [state, dispatch] = useReducer(activityReducer, undefined, createInitialActivityState)

  // Initial load + reload whenever the vault or the active filter changes.
  useEffect(() => {
    if (!vaultId || !apiClient) return
    void loadActivity(dispatch, apiClient, vaultId, state.activeTypes, state.range, state.pathPrefix || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, apiClient, state.activeTypes, state.range, state.pathPrefix])

  // Live refresh on vault:change — merge the newest slice to the head.
  useEffect(() => {
    if (!vaultId || !apiClient) return
    const unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId !== vaultId) return
      void refreshRecentActivity(dispatch, apiClient, vaultId, state.activeTypes, state.range, state.pathPrefix || undefined)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, apiClient, state.activeTypes, state.range, state.pathPrefix])

  // Adopt the per-vault persisted range (full variant only). Reads the stored
  // value and syncs it into local state on mount / vault switch.
  const persistedRange = useVaultSetting('activityRange')
  useEffect(() => {
    if (variant !== 'full') return
    const stored = VALID_RANGES.includes(persistedRange as ActivityRange)
      ? (persistedRange as ActivityRange)
      : DEFAULT_ACTIVITY_RANGE
    dispatch({ type: 'SET_RANGE', range: stored })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, variant, persistedRange])

  // Lanes that actually have events (so empty chips never show).
  const presentLanes = useMemo<ActivityLane[]>(() => {
    const present = new Set<ActivityLane>()
    for (const evt of state.events) present.add(ACTIVITY_EVENT_META[evt.type].lane)
    return ALL_LANES.filter(l => present.has(l))
  }, [state.events])

  const activeLane = useMemo<ActivityLane | null>(() => {
    if (state.activeTypes.length === 0) return null
    const laneOf = ACTIVITY_EVENT_META[state.activeTypes[0] as ActivityEventType]?.lane
    return laneOf ?? null
  }, [state.activeTypes])

  const buckets = useMemo(() => groupIntoTimeBuckets(state.events), [state.events])

  const selectLane = useCallback((lane: ActivityLane | null) => {
    const types: ActivityEventType[] = lane ? typesForLane(lane) : []
    dispatch({ type: 'SET_ACTIVE_TYPES', types })
  }, [])

  // Range change: update local state and persist per user+vault.
  const selectRange = useCallback((range: ActivityRange) => {
    dispatch({ type: 'SET_RANGE', range })
    updateVaultSettings({ activityRange: range })
  }, [])

  const handleOpen = useCallback((evt: ActivityEvent) => {
    if (!vaultId) return
    if (evt.type === 'note.deleted') return // deleted — nothing to open
    onOpenFile(vaultId, evt.path)
  }, [vaultId, onOpenFile])

  const loadMore = useCallback(() => {
    if (!vaultId || !apiClient || !state.nextCursor) return
    void loadMoreActivity(dispatch, apiClient, vaultId, state.nextCursor, state.activeTypes, state.range, state.pathPrefix || undefined)
  }, [vaultId, apiClient, state.nextCursor, state.activeTypes, state.range, state.pathPrefix])

  // Folder list for the folder filter (full variant only).
  const folderPaths = useMemo(
    () => (vaultId ? collectFolderPaths(appState.vaultTrees[vaultId] ?? null) : []),
    [vaultId, appState.vaultTrees],
  )

  const selectFolder = useCallback((pathPrefix: string) => {
    dispatch({ type: 'SET_PATH_PREFIX', pathPrefix })
  }, [])

  const bucketLabel = (key: string): string => t(`activity.bucket.${key}` as TranslationKey)

  return (
    <div className={`activity-timeline activity-timeline--${variant}`}>
      {/* Filter row: lane chips (when events exist) + folder filter (full variant) */}
      {(presentLanes.length > 0 || (variant === 'full' && folderPaths.length > 0)) && (
        <div className="activity-timeline__filters" role="group" aria-label={t('activity.filterLabel')}>
          {presentLanes.length > 0 && (
            <button
              type="button"
              className={`activity-chip ${activeLane === null ? 'activity-chip--active' : ''}`}
              aria-pressed={activeLane === null}
              onClick={() => selectLane(null)}
            >
              {t('activity.lane.all')}
            </button>
          )}
          {presentLanes.map(lane => (
            <button
              key={lane}
              type="button"
              className={`activity-chip ${activeLane === lane ? 'activity-chip--active' : ''}`}
              aria-pressed={activeLane === lane}
              onClick={() => selectLane(lane)}
            >
              {t(laneLabelKey(lane) as TranslationKey)}
            </button>
          ))}
          {variant === 'full' && folderPaths.length > 0 && (
            <select
              className="activity-folder-filter"
              aria-label={t('activity.folderFilter.all')}
              value={state.pathPrefix}
              onChange={e => selectFolder(e.target.value)}
            >
              <option value="">{t('activity.folderFilter.all')}</option>
              {folderPaths.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="activity-timeline__content">
        <div className="activity-timeline__main">
          {state.loading && (
            <div className="activity-timeline__status" role="status" aria-live="polite">
              {t('activity.loading')}
            </div>
          )}

          {state.error && !state.loading && (
            <div className="activity-timeline__status activity-timeline__error" role="alert">
              {state.error}
            </div>
          )}

          {!state.loading && !state.error && state.events.length === 0 && (
            <div className="activity-timeline__empty" role="status">
              <History size={28} aria-hidden="true" />
              <p>{t('activity.empty')}</p>
            </div>
          )}

          {!state.loading && buckets.length > 0 && (
            <div className="activity-timeline__buckets">
              {buckets.map(bucket => (
                <section className="activity-bucket" key={bucket.key} aria-label={bucketLabel(bucket.key)}>
                  <h3 className="activity-bucket__header">{bucketLabel(bucket.key)}</h3>
                  <ul className="activity-bucket__list">
                    {bucket.events.map(evt => {
                      const meta = ACTIVITY_EVENT_META[evt.type]
                      const Icon = meta.icon
                      const openable = evt.type !== 'note.deleted'
                      const originMeta = originBadgeMeta(evt.origin)
                      const OriginIcon = originMeta?.icon
                      return (
                        <li key={evt.id} className="activity-row">
                          <button
                            type="button"
                            className={`activity-row__btn ${openable ? '' : 'activity-row__btn--disabled'}`}
                            onClick={() => handleOpen(evt)}
                            disabled={!openable}
                            title={evt.path}
                          >
                            <span className={`activity-row__icon activity-row__icon--${meta.lane}`}>
                              <Icon size={16} aria-hidden="true" />
                            </span>
                            <span className="activity-row__body">
                              <span className="activity-row__title">
                                {fileName(evt.path)}
                                {evt.type === 'note.moved' && evt.oldPath && (
                                  <span className="activity-row__from"> ← {fileName(evt.oldPath)}</span>
                                )}
                                {originMeta && OriginIcon && (
                                  <span className="activity-row__origin" title={t(originMeta.labelKey as TranslationKey)}>
                                    <OriginIcon size={11} aria-hidden="true" />
                                    {t(originMeta.labelKey as TranslationKey)}
                                  </span>
                                )}
                              </span>
                              <span className="activity-row__meta">
                                {t(meta.labelKey as TranslationKey)} · {evt.user} · {formatRelativeTime(evt.timestamp)}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}

              {state.nextCursor && (
                <button
                  type="button"
                  className="activity-timeline__more"
                  onClick={loadMore}
                  disabled={state.loadingMore}
                >
                  {state.loadingMore ? t('activity.loadingMore') : t('activity.loadMore')}
                </button>
              )}
            </div>
          )}
        </div>

        {variant === 'full' && vaultId && apiClient && (
          <ActivityStatPanel
            events={state.events}
            heatmapEvents={state.heatmapEvents}
            range={state.range}
            onRangeChange={selectRange}
            apiClient={apiClient}
            vaultId={vaultId}
            dispatch={dispatch}
          />
        )}
      </div>
    </div>
  )
}
