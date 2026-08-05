import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerHoverLinkSource,
  unregisterHoverLinkSource,
  getHoverLinkSources,
  requestHoverPreview,
  dismissHoverPreview,
  onHoverPreview,
  hoverLinkEventToRequest,
  resetHoverLinkBus,
} from './hover-link-bus'

const el = (): HTMLElement => document.createElement('a')

describe('hover-link-bus', () => {
  beforeEach(() => resetHoverLinkBus())

  describe('source registration', () => {
    it('records a source with its display name', () => {
      registerHoverLinkSource('kanban', { display: 'Kanban board' })

      expect(getHoverLinkSources()).toEqual([{ id: 'kanban', display: 'Kanban board' }])
    })

    it('falls back to the id when no display name is given', () => {
      registerHoverLinkSource('plain')

      expect(getHoverLinkSources()[0]!.display).toBe('plain')
    })

    it('withdraws a source', () => {
      registerHoverLinkSource('kanban')
      unregisterHoverLinkSource('kanban')

      expect(getHoverLinkSources()).toEqual([])
    })
  })

  describe('request routing', () => {
    it('delivers a request to the subscriber', () => {
      const onRequest = vi.fn()
      onHoverPreview(onRequest, vi.fn())

      const target = el()
      requestHoverPreview({ linkPath: 'note.md', targetEl: target, source: 'internal-link' })

      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({ linkPath: 'note.md', targetEl: target }),
      )
    })

    it('delivers dismissals', () => {
      const onDismiss = vi.fn()
      onHoverPreview(vi.fn(), onDismiss)

      dismissHoverPreview()

      expect(onDismiss).toHaveBeenCalledOnce()
    })

    it('stops delivering after unsubscribe', () => {
      const onRequest = vi.fn()
      const unsubscribe = onHoverPreview(onRequest, vi.fn())

      unsubscribe()
      requestHoverPreview({ linkPath: 'x.md', targetEl: el(), source: 'internal-link' })

      expect(onRequest).not.toHaveBeenCalled()
    })

    it('does not throw when nothing is listening', () => {
      expect(() =>
        requestHoverPreview({ linkPath: 'x.md', targetEl: el(), source: 'internal-link' }),
      ).not.toThrow()
    })
  })

  describe('hoverLinkEventToRequest', () => {
    it('translates an Obsidian hover-link payload', () => {
      const targetEl = el()

      const request = hoverLinkEventToRequest({
        event: new MouseEvent('mouseover'),
        source: 'kanban',
        targetEl,
        linktext: 'Some Note',
        sourcePath: 'board.md',
      })

      expect(request).toEqual({
        linkPath: 'Some Note',
        targetEl,
        source: 'kanban',
        sourcePath: 'board.md',
      })
    })

    it('defaults the source when the payload omits it', () => {
      const request = hoverLinkEventToRequest({ targetEl: el(), linktext: 'X' })

      expect(request?.source).toBe('plugin')
    })

    it.each([
      ['no linktext', { targetEl: null }],
      ['no target element', { linktext: 'X' }],
      ['a non-element target', { linktext: 'X', targetEl: 'not an element' }],
      ['null', null],
      ['a string', 'nonsense'],
    ])('returns null for %s rather than guessing', (_name, payload) => {
      const withEl = payload && typeof payload === 'object' && 'targetEl' in payload && payload.targetEl === null
        ? { ...payload, targetEl: el() }
        : payload

      expect(hoverLinkEventToRequest(withEl)).toBeNull()
    })
  })
})
