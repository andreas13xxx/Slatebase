import { describe, it, expect, afterEach } from 'vitest'
import { Scope, Keymap, dispatchKeydownToScopeStack } from './obsidian-api-extensions'

function keydown(key: string, opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, cancelable: true, ...opts })
}

describe('Scope', () => {
  it('fires a handler registered for an exact key with no modifiers', () => {
    const scope = new Scope()
    let called = false
    scope.register([], 'Enter', () => { called = true })

    expect(scope.handleKey(keydown('Enter'))).toBe(true)
    expect(called).toBe(true)
  })

  it('does not fire when the key differs', () => {
    const scope = new Scope()
    let called = false
    scope.register([], 'Enter', () => { called = true })

    expect(scope.handleKey(keydown('Escape'))).toBe(false)
    expect(called).toBe(false)
  })

  it('treats a null key as a wildcard', () => {
    const scope = new Scope()
    let called = false
    scope.register(['Shift'], null, () => { called = true })

    expect(scope.handleKey(keydown('x', { shiftKey: true }))).toBe(true)
    expect(called).toBe(true)
  })

  it('matches Mod against either ctrlKey or metaKey', () => {
    const scope = new Scope()
    let calls = 0
    scope.register(['Mod'], 's', () => { calls++ })

    scope.handleKey(keydown('s', { ctrlKey: true }))
    scope.handleKey(keydown('s', { metaKey: true }))

    expect(calls).toBe(2)
  })

  it('requires an exact modifier match — Mod alone does not fire on Mod+Shift', () => {
    const scope = new Scope()
    let called = false
    scope.register(['Mod'], 's', () => { called = true })

    expect(scope.handleKey(keydown('s', { ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(called).toBe(false)
  })

  it('preventDefaults the event when a handler consumes it', () => {
    const scope = new Scope()
    scope.register([], 'Enter', () => {})
    const evt = keydown('Enter')

    scope.handleKey(evt)

    expect(evt.defaultPrevented).toBe(true)
  })

  it('falls through to the next handler when one returns false', () => {
    const scope = new Scope()
    const order: string[] = []
    scope.register([], 'Enter', () => { order.push('first') })
    scope.register([], 'Enter', () => { order.push('second'); return false })

    // Most recently registered handler is tried first; it declines (returns
    // false), so the earlier one gets a turn.
    const handled = scope.handleKey(keydown('Enter'))

    expect(order).toEqual(['second', 'first'])
    expect(handled).toBe(true)
  })

  it('stops calling handlers after unregister', () => {
    const scope = new Scope()
    let called = false
    const handler = scope.register([], 'Enter', () => { called = true })
    scope.unregister(handler)

    expect(scope.handleKey(keydown('Enter'))).toBe(false)
    expect(called).toBe(false)
  })

  it('exposes a keys array for plugins (Kanban) that reach into it directly', () => {
    const scope = new Scope()
    expect(scope.keys).toEqual([])
  })
})

describe('Keymap scope stack / dispatchKeydownToScopeStack', () => {
  const pushed: Array<{ keymap: Keymap; scope: Scope }> = []

  afterEach(() => {
    // Scopes pushed during a test must not leak into the next one.
    for (const { keymap, scope } of pushed.splice(0)) keymap.popScope(scope)
  })

  function push(scope: Scope): Keymap {
    const keymap = new Keymap()
    keymap.pushScope(scope)
    pushed.push({ keymap, scope })
    return keymap
  }

  it('does nothing when the stack is empty', () => {
    expect(dispatchKeydownToScopeStack(keydown('a'))).toBe(false)
  })

  it('dispatches to a pushed scope', () => {
    const scope = new Scope()
    let called = false
    scope.register([], 'a', () => { called = true })
    push(scope)

    expect(dispatchKeydownToScopeStack(keydown('a'))).toBe(true)
    expect(called).toBe(true)
  })

  it('stops dispatching once the scope is popped', () => {
    const scope = new Scope()
    let called = false
    scope.register([], 'a', () => { called = true })
    const keymap = push(scope)
    keymap.popScope(scope)

    expect(dispatchKeydownToScopeStack(keydown('a'))).toBe(false)
    expect(called).toBe(false)
  })

  it('gives the most recently pushed scope first refusal', () => {
    const outer = new Scope()
    const inner = new Scope()
    const order: string[] = []
    outer.register([], 'a', () => { order.push('outer') })
    inner.register([], 'a', () => { order.push('inner') })
    push(outer)
    push(inner)

    dispatchKeydownToScopeStack(keydown('a'))

    expect(order).toEqual(['inner'])
  })

  it('falls through to an outer scope when the inner one does not handle the key', () => {
    const outer = new Scope()
    const inner = new Scope()
    let outerCalled = false
    outer.register([], 'a', () => { outerCalled = true })
    inner.register([], 'b', () => {})
    push(outer)
    push(inner)

    const handled = dispatchKeydownToScopeStack(keydown('a'))

    expect(handled).toBe(true)
    expect(outerCalled).toBe(true)
  })
})
