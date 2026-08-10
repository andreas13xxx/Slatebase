import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function createContainer(): HTMLDivElement {
  const container = document.createElement('div')
  container.innerHTML = `
    <button id="btn1">First</button>
    <input id="input1" type="text" />
    <a href="#" id="link1">Link</a>
    <button id="btn2">Last</button>
  `
  document.body.appendChild(container)
  return container
}

function dispatchKeydown(target: EventTarget, key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

describe('useFocusTrap', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    document.body.innerHTML = ''
    container = createContainer()
  })

  describe('with attached container', () => {
    function setupTrap(isActive: boolean, onEscape?: () => void, returnFocusOnDeactivate?: boolean) {
      const { result, rerender } = renderHook(
        (props: { isActive: boolean; onEscape?: () => void; returnFocusOnDeactivate?: boolean }) =>
          useFocusTrap<HTMLDivElement>(props),
        { initialProps: { isActive, onEscape, returnFocusOnDeactivate } },
      )

      // Attach the container to the ref (simulates what React would do with ref={containerRef})
      ;(result.current as { current: HTMLDivElement | null }).current = container

      return { result, rerender }
    }

    it('focuses the first focusable child when activated', () => {
      const trigger = document.createElement('button')
      trigger.textContent = 'Trigger'
      document.body.appendChild(trigger)
      trigger.focus()

      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      expect(document.activeElement).toBe(container.querySelector('#btn1'))
    })

    it('remembers the trigger element on activation', () => {
      const trigger = document.createElement('button')
      trigger.id = 'trigger'
      document.body.appendChild(trigger)
      trigger.focus()

      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      // Now deactivate — focus should return to trigger
      rerender({ isActive: false, returnFocusOnDeactivate: true })
      expect(document.activeElement).toBe(trigger)
    })

    it('Tab wraps from last focusable to first', () => {
      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      // Focus the last element
      const lastBtn = container.querySelector('#btn2') as HTMLElement
      lastBtn.focus()
      expect(document.activeElement).toBe(lastBtn)

      // Press Tab
      dispatchKeydown(container, 'Tab', false)

      expect(document.activeElement).toBe(container.querySelector('#btn1'))
    })

    it('Shift+Tab wraps from first focusable to last', () => {
      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      // Focus the first element
      const firstBtn = container.querySelector('#btn1') as HTMLElement
      firstBtn.focus()
      expect(document.activeElement).toBe(firstBtn)

      // Press Shift+Tab
      dispatchKeydown(container, 'Tab', true)

      expect(document.activeElement).toBe(container.querySelector('#btn2'))
    })

    it('Tab does not wrap when focus is on a middle element', () => {
      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      // Focus a middle element
      const input = container.querySelector('#input1') as HTMLElement
      input.focus()

      // Press Tab — should NOT wrap (normal browser behavior handles it)
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: false,
        bubbles: true,
        cancelable: true,
      })
      container.dispatchEvent(event)

      // Focus should remain where it was (no forced wrap)
      expect(document.activeElement).toBe(input)
    })

    it('Escape calls the onEscape callback', () => {
      const onEscape = vi.fn()
      const { rerender } = setupTrap(false, onEscape)
      rerender({ isActive: true, onEscape })

      dispatchKeydown(container, 'Escape')

      expect(onEscape).toHaveBeenCalledOnce()
    })

    it('Escape does nothing when no onEscape callback is provided', () => {
      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      // Should not throw
      dispatchKeydown(container, 'Escape')
    })

    it('does nothing when isActive is false', () => {
      const onEscape = vi.fn()
      setupTrap(false, onEscape)

      dispatchKeydown(container, 'Escape')
      expect(onEscape).not.toHaveBeenCalled()

      dispatchKeydown(container, 'Tab')
      // No error, no focus manipulation
    })

    it('returns focus to trigger element on deactivation by default', () => {
      const trigger = document.createElement('button')
      trigger.id = 'trigger'
      document.body.appendChild(trigger)
      trigger.focus()

      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      expect(document.activeElement).toBe(container.querySelector('#btn1'))

      rerender({ isActive: false })
      expect(document.activeElement).toBe(trigger)
    })

    it('does not return focus when returnFocusOnDeactivate is false', () => {
      const trigger = document.createElement('button')
      trigger.id = 'trigger'
      document.body.appendChild(trigger)
      trigger.focus()

      const { rerender } = setupTrap(false, undefined, true)
      rerender({ isActive: true, returnFocusOnDeactivate: false })

      const firstBtn = container.querySelector('#btn1') as HTMLElement
      expect(document.activeElement).toBe(firstBtn)

      rerender({ isActive: false, returnFocusOnDeactivate: false })
      // Focus should NOT be moved back to trigger
      expect(document.activeElement).not.toBe(trigger)
    })

    it('handles container with no focusable elements', () => {
      // Replace container content with non-focusable elements
      container.innerHTML = '<div>Not focusable</div><span>Also not</span>'

      const { rerender } = setupTrap(false)
      rerender({ isActive: true })

      // Tab should be prevented but not throw
      dispatchKeydown(container, 'Tab')
    })

    it('handles the updated onEscape callback without stale closure', () => {
      const onEscape1 = vi.fn()
      const onEscape2 = vi.fn()

      const { rerender } = setupTrap(false, onEscape1)
      rerender({ isActive: true, onEscape: onEscape1 })

      // Update onEscape
      rerender({ isActive: true, onEscape: onEscape2 })

      dispatchKeydown(container, 'Escape')

      expect(onEscape1).not.toHaveBeenCalled()
      expect(onEscape2).toHaveBeenCalledOnce()
    })
  })
})
