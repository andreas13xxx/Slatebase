/**
 * Teardown contract for the `Component` and `Plugin` base classes.
 *
 * Both used to accept `register()` callbacks and `registerEvent()` refs and then
 * drop them: the callback never ran and the listener stayed subscribed, so a
 * disabled plugin kept reacting to vault events for the rest of the session.
 * The sandbox cannot cover this — it only reclaims timers and DOM listeners it
 * wrapped itself, and knows nothing about event refs or cleanup callbacks.
 *
 * These tests pin the behaviour at the level plugins actually rely on: unload
 * releases everything registered through the base class.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { EventSystem } from './event-system'

beforeAll(() => {
  installObsidianGlobals()
})

type Lifecycle = {
  load(): void
  unload(): void
  register(cb: () => void): void
  registerEvent(ref: unknown): void
  registerDomEvent(el: EventTarget, event: string, handler: EventListener): void
  addChild<T>(child: T): T
}

function construct(name: 'Component' | 'Plugin'): Lifecycle {
  const Ctor = window.obsidian?.[name] as new (app?: unknown) => Lifecycle
  return new Ctor({})
}

describe.each(['Component', 'Plugin'] as const)('%s teardown', (name) => {
  it('runs register() cleanup callbacks on unload', () => {
    const instance = construct(name)
    let ran = 0
    instance.load()
    instance.register(() => { ran++ })
    expect(ran).toBe(0)

    instance.unload()
    expect(ran).toBe(1)
  })

  it('keeps unloading after a cleanup callback throws', () => {
    const instance = construct(name)
    let ran = false
    instance.load()
    instance.register(() => { throw new Error('boom') })
    instance.register(() => { ran = true })

    expect(() => instance.unload()).not.toThrow()
    expect(ran).toBe(true)
  })

  it('deregisters listeners handed to registerEvent() on unload', () => {
    const events = new EventSystem()
    const instance = construct(name)
    let fired = 0

    instance.load()
    instance.registerEvent(events.on('modify', () => { fired++ }))
    events.trigger('modify')
    expect(fired).toBe(1)

    instance.unload()
    events.trigger('modify')
    expect(fired).toBe(1)
  })

  it('removes registerDomEvent() listeners on unload', () => {
    const instance = construct(name)
    const target = document.createElement('div')
    let fired = 0

    instance.load()
    instance.registerDomEvent(target, 'click', () => { fired++ })
    target.dispatchEvent(new Event('click'))
    expect(fired).toBe(1)

    instance.unload()
    target.dispatchEvent(new Event('click'))
    expect(fired).toBe(1)
  })

  it('unloads child components', () => {
    const instance = construct(name)
    const child = construct('Component')
    let childCleanup = 0

    instance.load()
    child.load()
    child.register(() => { childCleanup++ })
    instance.addChild(child)

    instance.unload()
    expect(childCleanup).toBe(1)
  })

  it('ignores an event ref from an emitter it cannot reach', () => {
    const instance = construct(name)
    instance.load()
    // A foreign ref has no owning EventSystem, so there is nothing to offref.
    // It must be dropped rather than retained and blindly called on unload.
    expect(() => instance.registerEvent({ id: 'x', event: 'y', callback: () => {} })).not.toThrow()
    expect(() => instance.unload()).not.toThrow()
  })
})
