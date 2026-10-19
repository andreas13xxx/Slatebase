/**
 * Pure, dependency-free aggregation helpers for the activity stat panel.
 *
 * Both take an event list as an argument and compute from it alone (no fetch,
 * no clock reads beyond `buildHeatmap`'s explicit `now`), the same shape as
 * `time-buckets.ts`. `countByType` runs over the range-loaded events;
 * `buildHeatmap` runs over the heatmap window's own events (a separate fetch).
 */

import type { ActivityEvent, ActivityEventType } from '../../types'

/** One day-cell of the heatmap. */
export interface HeatmapCell {
  /** Local calendar day as YYYY-MM-DD. */
  date: string
  /** Number of events recorded that day. */
  count: number
}

/** The heatmap as a grid of weeks (oldest first), each a row of 7 day-cells (Mon→Sun). */
export interface Heatmap {
  weeks: HeatmapCell[][]
  /** The highest single-day count in the grid (for colour scaling); 0 when empty. */
  max: number
}

/**
 * Count events per type over the given list. Types with no events are omitted.
 * The caller orders/labels them via `ACTIVITY_EVENT_META`.
 */
export function countByType(events: ActivityEvent[]): Map<ActivityEventType, number> {
  const counts = new Map<ActivityEventType, number>()
  for (const evt of events) {
    counts.set(evt.type, (counts.get(evt.type) ?? 0) + 1)
  }
  return counts
}

/** Local-calendar day key (YYYY-MM-DD) for a Date, independent of UTC offset. */
function dayKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Monday-based weekday index (0 = Monday … 6 = Sunday). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/**
 * Build a `weeks` × 7 heatmap grid ending at the week containing `now`.
 * Each cell is one local calendar day; `count` is how many of `events` fell on
 * that day. Days outside the window simply never match. Pure given `now`
 * (defaults to the current time) so it is testable with a fixed clock.
 */
export function buildHeatmap(events: ActivityEvent[], weeks: number, now: Date = new Date()): Heatmap {
  const safeWeeks = Math.max(1, Math.floor(weeks))

  // Count events per local day.
  const perDay = new Map<string, number>()
  for (const evt of events) {
    const key = dayKey(new Date(evt.timestamp))
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }

  // Grid start: Monday of the week `safeWeeks - 1` weeks before `now`'s week.
  const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  startOfThisWeek.setDate(startOfThisWeek.getDate() - mondayIndex(now))
  const gridStart = new Date(startOfThisWeek)
  gridStart.setDate(gridStart.getDate() - (safeWeeks - 1) * 7)

  const grid: HeatmapCell[][] = []
  let max = 0
  const cursor = new Date(gridStart)
  for (let w = 0; w < safeWeeks; w++) {
    const week: HeatmapCell[] = []
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor)
      const count = perDay.get(key) ?? 0
      if (count > max) max = count
      week.push({ date: key, count })
      cursor.setDate(cursor.getDate() + 1)
    }
    grid.push(week)
  }

  return { weeks: grid, max }
}
