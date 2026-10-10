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
} from '../../state/activityState'
import { loadActivity, loadMoreActivity, refreshRecentActivity } from '../../state/activityActions'
import { groupIntoTimeBuckets } from './time-buckets'
import {
  ACTIVITY_EVENT_META,
  typesForLane,
  laneLabelKey,
  type ActivityLane,
} from './activity-event-meta'
import './ActivityTimelineView.css'

export interface ActivityTimelineViewProps {
  /** Opens a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
  /** `full` for the tab, `compact` for the sidebar. */
  variant: 'full' | 'compact'
}

const ALL_LANES: ActivityLane[] = ['notes', 'canvas', 'bases', 'snippets']

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
    void loadActivity(dispatch, apiClient, vaultId, state.activeTypes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, apiClient, state.activeTypes])

  // Live refresh on vault:change — merge the newest slice to the head.
  useEffect(() => {
    if (!vaultId || !apiClient) return
    const unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId !== vaultId) return
      void refreshRecentActivity(dispatch, apiClient, vaultId, state.activeTypes)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, apiClient, state.activeTypes])

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

  const handleOpen = useCallback((evt: ActivityEvent) => {
    if (!vaultId) return
    if (evt.type === 'note.deleted') return // deleted — nothing to open
    onOpenFile(vaultId, evt.path)
  }, [vaultId, onOpenFile])

  const loadMore = useCallback(() => {
    if (!vaultId || !apiClient || !state.nextCursor) return
    void loadMoreActivity(dispatch, apiClient, vaultId, state.nextCursor, state.activeTypes)
  }, [vaultId, apiClient, state.nextCursor, state.activeTypes])

  const bucketLabel = (key: string): string => t(`activity.bucket.${key}` as TranslationKey)

  return (
    <div className={`activity-timeline activity-timeline--${variant}`}>
      {/* Filter chips — only lanes with events */}
      {presentLanes.length > 0 && (
        <div className="activity-timeline__filters" role="group" aria-label={t('activity.filterLabel')}>
          <button
            type="button"
            className={`activity-chip ${activeLane === null ? 'activity-chip--active' : ''}`}
            aria-pressed={activeLane === null}
            onClick={() => selectLane(null)}
          >
            {t('activity.lane.all')}
          </button>
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
        </div>
      )}

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
  )
}
