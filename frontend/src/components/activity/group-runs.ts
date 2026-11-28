/**
 * Folds runs of look-alike activity events (e.g. ten notes deleted one after the
 * other) into one expandable group.
 *
 * Pure — no React, no DOM. Input is newest-first, as the timeline holds it; the
 * output keeps that order. Only *adjacent* events fold: an unrelated event in
 * between ends the run, so the timeline never reorders what happened.
 */

import type { ActivityEvent } from '../../types'

/** Largest pause between two neighbouring events that still counts as one run. */
export const GROUP_MAX_GAP_MS = 60_000

/** A run needs at least this many events to become a group. */
export const GROUP_MIN_SIZE = 2

export type ActivityRow =
  | { kind: 'single'; event: ActivityEvent }
  | {
      kind: 'group'
      /** Stable across live refresh: new events join at the head, the oldest id stays. */
      key: string
      events: ActivityEvent[]
    }

function timeOf(evt: ActivityEvent): number {
  return Date.parse(evt.timestamp)
}

/** Same kind of activity by the same person from the same place. */
function isLookAlike(a: ActivityEvent, b: ActivityEvent): boolean {
  return a.type === b.type && a.user === b.user && (a.origin ?? 'web') === (b.origin ?? 'web')
}

/** sync.completed is already a summary of many files — never nest it. */
function isGroupable(evt: ActivityEvent): boolean {
  return evt.type !== 'sync.completed'
}

/** Folds adjacent look-alike events (newest-first) into groups of at least `minSize`. */
export function groupLookAlikeRuns(
  events: ActivityEvent[],
  maxGapMs: number = GROUP_MAX_GAP_MS,
  minSize: number = GROUP_MIN_SIZE,
): ActivityRow[] {
  const rows: ActivityRow[] = []
  let run: ActivityEvent[] = []

  const flush = (): void => {
    if (run.length >= minSize) {
      const oldest = run[run.length - 1]
      rows.push({ kind: 'group', key: oldest ? oldest.id : '', events: run })
    } else {
      for (const event of run) rows.push({ kind: 'single', event })
    }
    run = []
  }

  for (const evt of events) {
    const last = run[run.length - 1]
    const gap = last ? timeOf(last) - timeOf(evt) : 0
    const continues = last !== undefined && isGroupable(evt) && isLookAlike(last, evt) && gap <= maxGapMs
    if (!continues) flush()
    run.push(evt)
  }
  flush()
  return rows
}
