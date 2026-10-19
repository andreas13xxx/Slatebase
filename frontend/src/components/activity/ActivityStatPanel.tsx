/**
 * ActivityStatPanel — the right-hand statistics column of the activity timeline
 * (full variant only).
 *
 * Three pieces:
 *  - Range_Switcher chips (day/week/month/year) — drive the list + by-type.
 *  - "By type" bars — counted over the range-loaded `events` (no own fetch).
 *  - Activity_Heatmap — a fixed "last N weeks" window loaded SEPARATELY from
 *    the range (L4), so it is never empty when the range is "day".
 *
 * The heatmap's own fetch fires on mount and on vault switch, guarded against
 * vault-switch races. Pure helpers live in `activity-stats.ts`.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import type { Dispatch } from 'react'
import { useTranslation } from '../../i18n'
import type { TranslationKey } from '../../i18n'
import type { IApiClient } from '../../api'
import type { ActivityEvent } from '../../types'
import type { ActivityAction, ActivityRange } from '../../state/activityState'
import { HEATMAP_WEEKS } from '../../state/activityState'
import { loadActivityHeatmap } from '../../state/activityActions'
import { countByType, buildHeatmap } from './activity-stats'
import { ACTIVITY_EVENT_META } from './activity-event-meta'

const RANGES: ActivityRange[] = ['day', 'week', 'month', 'year']

export interface ActivityStatPanelProps {
  /** Range-loaded events (for the by-type bars). */
  events: ActivityEvent[]
  /** Heatmap-window events (loaded via its own fetch). */
  heatmapEvents: ActivityEvent[]
  /** Current range selection. */
  range: ActivityRange
  /** Change the range. */
  onRangeChange: (range: ActivityRange) => void
  /** For the heatmap's own fetch. */
  apiClient: IApiClient
  vaultId: string
  dispatch: Dispatch<ActivityAction>
}

export function ActivityStatPanel({
  events, heatmapEvents, range, onRangeChange, apiClient, vaultId, dispatch,
}: ActivityStatPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const latestVault = useRef(vaultId)

  // Heatmap fetch: own fixed window, independent of the range (L4). Re-runs on
  // vault switch, guarded against a late response landing on the new vault.
  useEffect(() => {
    latestVault.current = vaultId
    const signal = { cancelled: false }
    void loadActivityHeatmap(dispatch, apiClient, vaultId, signal)
    return () => { signal.cancelled = true }
  }, [vaultId, apiClient, dispatch])

  const byType = useMemo(() => {
    const counts = countByType(events)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [events])

  const heatmap = useMemo(() => buildHeatmap(heatmapEvents, HEATMAP_WEEKS), [heatmapEvents])
  const maxByType = byType.length > 0 ? byType[0]![1] : 0

  return (
    <aside className="activity-stat-panel" aria-label={t('activity.stats.byType')}>
      {/* Range switcher */}
      <div className="activity-stat-panel__ranges" role="group" aria-label={t('activity.filterLabel')}>
        {RANGES.map(r => (
          <button
            key={r}
            type="button"
            className={`activity-range-chip ${range === r ? 'activity-range-chip--active' : ''}`}
            aria-pressed={range === r}
            onClick={() => onRangeChange(r)}
          >
            {t(`activity.range.${r}` as TranslationKey)}
          </button>
        ))}
      </div>

      {/* By type */}
      <section className="activity-stat-panel__section">
        <h4 className="activity-stat-panel__heading">{t('activity.stats.byType')}</h4>
        {byType.length === 0 ? (
          <p className="activity-stat-panel__empty">—</p>
        ) : (
          <ul className="activity-stat-panel__bars">
            {byType.map(([type, count]) => {
              const meta = ACTIVITY_EVENT_META[type]
              const pct = maxByType > 0 ? Math.round((count / maxByType) * 100) : 0
              return (
                <li key={type} className="activity-stat-bar">
                  <span className="activity-stat-bar__label">{t(meta.labelKey as TranslationKey)}</span>
                  <span className="activity-stat-bar__track" aria-hidden="true">
                    <span className="activity-stat-bar__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="activity-stat-bar__count">{count}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Heatmap */}
      <section className="activity-stat-panel__section">
        <h4 className="activity-stat-panel__heading">{t('activity.stats.last10Weeks')}</h4>
        <div
          className="activity-heatmap"
          role="img"
          aria-label={t('activity.stats.last10Weeks')}
        >
          {heatmap.weeks.map((week, wi) => (
            <div key={wi} className="activity-heatmap__week">
              {week.map(cell => {
                // 0..4 intensity bucket scaled against the window's own max.
                const level = cell.count === 0 || heatmap.max === 0
                  ? 0
                  : Math.min(4, Math.ceil((cell.count / heatmap.max) * 4))
                return (
                  <span
                    key={cell.date}
                    className={`activity-heatmap__cell activity-heatmap__cell--l${level}`}
                    title={`${cell.date}: ${cell.count}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}
