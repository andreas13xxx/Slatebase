/**
 * Single source of truth mapping each activity event type to its icon, a
 * localization key for its label, and the filter group ("lane") it belongs to.
 *
 * Shared by the timeline rows, the type legend and the filter chips so the
 * three surfaces never drift on which type means what.
 */

import type { ComponentType } from 'react'
import {
  FilePlus, FilePen, FileX, FileSymlink, FileClock,
  LayoutDashboard, Table2, Palette, type LucideProps,
} from 'lucide-react'
import type { ActivityEventType } from '../../types'

/** Filter lane an event type belongs to (drives the filter chips). */
export type ActivityLane = 'notes' | 'canvas' | 'bases' | 'snippets'

export interface ActivityEventMeta {
  icon: ComponentType<LucideProps>
  /** i18n key under `activity.eventType.*` for the human label. */
  labelKey: string
  lane: ActivityLane
}

export const ACTIVITY_EVENT_META: Record<ActivityEventType, ActivityEventMeta> = {
  'note.created': { icon: FilePlus, labelKey: 'activity.eventType.noteCreated', lane: 'notes' },
  'note.edited': { icon: FilePen, labelKey: 'activity.eventType.noteEdited', lane: 'notes' },
  'note.deleted': { icon: FileX, labelKey: 'activity.eventType.noteDeleted', lane: 'notes' },
  'note.moved': { icon: FileSymlink, labelKey: 'activity.eventType.noteMoved', lane: 'notes' },
  'note.restored': { icon: FileClock, labelKey: 'activity.eventType.noteRestored', lane: 'notes' },
  'canvas.created': { icon: LayoutDashboard, labelKey: 'activity.eventType.canvasCreated', lane: 'canvas' },
  'canvas.edited': { icon: LayoutDashboard, labelKey: 'activity.eventType.canvasEdited', lane: 'canvas' },
  'canvas.deleted': { icon: LayoutDashboard, labelKey: 'activity.eventType.canvasDeleted', lane: 'canvas' },
  'base.created': { icon: Table2, labelKey: 'activity.eventType.baseCreated', lane: 'bases' },
  'base.edited': { icon: Table2, labelKey: 'activity.eventType.baseEdited', lane: 'bases' },
  'base.deleted': { icon: Table2, labelKey: 'activity.eventType.baseDeleted', lane: 'bases' },
  'snippet.created': { icon: Palette, labelKey: 'activity.eventType.snippetCreated', lane: 'snippets' },
  'snippet.edited': { icon: Palette, labelKey: 'activity.eventType.snippetEdited', lane: 'snippets' },
  'snippet.deleted': { icon: Palette, labelKey: 'activity.eventType.snippetDeleted', lane: 'snippets' },
}

/** All event types that belong to a lane (for building a lane's type filter). */
export function typesForLane(lane: ActivityLane): ActivityEventType[] {
  return (Object.keys(ACTIVITY_EVENT_META) as ActivityEventType[]).filter(
    t => ACTIVITY_EVENT_META[t].lane === lane,
  )
}

/** i18n key for a lane's filter-chip label. */
export function laneLabelKey(lane: ActivityLane): string {
  return `activity.lane.${lane}`
}
