import { describe, it, expect, vi } from 'vitest'
import { buildCardMenuItems } from './base-card-menu'

describe('buildCardMenuItems', () => {
  it('offers the core note actions', () => {
    const items = buildCardMenuItems('v1', 'a/b.md', vi.fn(), false)
    const ids = items.map((i) => i.id)
    for (const id of ['open-tab', 'rename', 'move', 'delete', 'bookmark']) expect(ids).toContain(id)
  })

  it('opens the note via the open callback', () => {
    const open = vi.fn()
    buildCardMenuItems('v1', 'a/b.md', open, false).find((i) => i.id === 'open-tab')?.run?.()
    expect(open).toHaveBeenCalledWith('a/b.md')
  })

  it('disables changing actions when read-only', () => {
    const items = buildCardMenuItems('v1', 'a/b.md', vi.fn(), true)
    for (const id of ['rename', 'move', 'delete']) expect(items.find((i) => i.id === id)?.disabled).toBe(true)
  })
})
