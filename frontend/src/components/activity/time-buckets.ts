/**
 * Groups activity events into time buckets for the timeline view.
 *
 * Pure — no React, no DOM — so it is unit-testable with fixed timestamps.
 * Bucketing is computed against a reference "now" (the client's local time by
 * default) so a test can pin it.
 */

import type { ActivityEvent } from '../../types'

/** A labeled group of events sharing a time bucket. */
export interface TimeBucket {
  /** Stable key for the bucket (not localized). */
  key: 'today' | 'yesterday' | 'this-week' | 'older'
  /** The events in this bucket, in the order they arrived (newest first). */
  events: ActivityEvent[]
}

/** Returns the start-of-day epoch ms for a given date in local time. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Groups events (already newest-first) into Today / Yesterday / This week /
 * Older. "This week" is the span after yesterday back to 7 days ago; anything
 * before that is "Older". Empty buckets are omitted from the result.
 */
export function groupIntoTimeBuckets(events: ActivityEvent[], now: Date = new Date()): TimeBucket[] {
  const todayStart = startOfLocalDay(now)
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000

  const buckets: Record<TimeBucket['key'], ActivityEvent[]> = {
    today: [],
    yesterday: [],
    'this-week': [],
    older: [],
  }

  for (const evt of events) {
    const t = Date.parse(evt.timestamp)
    if (Number.isNaN(t)) {
      buckets.older.push(evt)
      continue
    }
    if (t >= todayStart) buckets.today.push(evt)
    else if (t >= yesterdayStart) buckets.yesterday.push(evt)
    else if (t >= weekStart) buckets['this-week'].push(evt)
    else buckets.older.push(evt)
  }

  const order: TimeBucket['key'][] = ['today', 'yesterday', 'this-week', 'older']
  return order
    .filter(key => buckets[key].length > 0)
    .map(key => ({ key, events: buckets[key] }))
}
