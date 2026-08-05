/**
 * The plugin-facing half of hover previews.
 *
 * A plugin declares itself with `registerHoverLinkSource` and then triggers a
 * `hover-link` event when the pointer enters one of its links — exactly as it
 * does in Obsidian, where the core "Page preview" plugin listens. Here the
 * WorkspaceShim forwards it to the popover.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkspaceShim } from './workspace-shim'
import {
  getHoverLinkSources,
  onHoverPreview,
  resetHoverLinkBus,
} from '../hover-link-bus'

describe('workspace hover-link bridge', () => {
  beforeEach(() => resetHoverLinkBus())

  it('records a source a plugin registers', () => {
    const workspace = new WorkspaceShim()

    workspace.registerHoverLinkSource('kanban', { display: 'Kanban board' })

    expect(getHoverLinkSources()).toEqual([{ id: 'kanban', display: 'Kanban board' }])
  })

  it('withdraws the source again', () => {
    const workspace = new WorkspaceShim()
    workspace.registerHoverLinkSource('kanban', {})

    workspace.unregisterHoverLinkSource('kanban')

    expect(getHoverLinkSources()).toEqual([])
  })

  it('turns a triggered hover-link event into a preview request', () => {
    const onRequest = vi.fn()
    onHoverPreview(onRequest, vi.fn())
    const workspace = new WorkspaceShim()
    const targetEl = document.createElement('a')

    workspace.trigger('hover-link', {
      event: new MouseEvent('mouseover'),
      source: 'kanban',
      targetEl,
      linktext: 'Target Note',
      sourcePath: 'board.md',
    })

    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({ linkPath: 'Target Note', targetEl, source: 'kanban' }),
    )
  })

  it('still delivers hover-link to normal listeners', () => {
    // Plugins may observe each other's hover events; forwarding to the popover
    // must not consume the event.
    const listener = vi.fn()
    const workspace = new WorkspaceShim()
    workspace.on('hover-link', listener)

    workspace.trigger('hover-link', {
      targetEl: document.createElement('a'),
      linktext: 'X',
    })

    expect(listener).toHaveBeenCalledOnce()
  })

  it('ignores a malformed hover-link payload without throwing', () => {
    const onRequest = vi.fn()
    onHoverPreview(onRequest, vi.fn())
    const workspace = new WorkspaceShim()

    expect(() => workspace.trigger('hover-link', { linktext: 'no target' })).not.toThrow()
    expect(onRequest).not.toHaveBeenCalled()
  })

  it('leaves other events untouched', () => {
    const onRequest = vi.fn()
    onHoverPreview(onRequest, vi.fn())
    const workspace = new WorkspaceShim()

    workspace.trigger('file-open', { targetEl: document.createElement('a'), linktext: 'X' })

    expect(onRequest).not.toHaveBeenCalled()
  })
})
