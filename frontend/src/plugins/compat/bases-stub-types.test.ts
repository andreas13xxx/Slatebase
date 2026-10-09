/**
 * Tests for the Bases plugin API wired onto `window.obsidian`.
 *
 * These used to pin a "doesn't crash / does nothing" no-op contract. The
 * Bases plugin API is now functional (see bases-view-registry.ts,
 * bases-values.ts, bases-query-controller.ts), so these pin the REAL
 * behaviour: the Value hierarchy works, the runtime classes carry data,
 * and `Plugin.registerBasesView()` actually registers a view type.
 */
import { describe, it, expect } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { getBasesViewRegistration, resetForVault } from './bases-view-registry'

installObsidianGlobals()

describe('Bases Value hierarchy on window.obsidian', () => {
  it('exposes every Value class as a constructible, extendable class with working methods', () => {
    for (const name of [
      'Value', 'NotNullValue', 'NullValue', 'PrimitiveValue',
      'BooleanValue', 'NumberValue', 'StringValue',
      'HTMLValue', 'IconValue', 'ImageValue', 'LinkValue', 'TagValue', 'UrlValue',
      'DateValue', 'RelativeDateValue', 'DurationValue', 'FileValue', 'ListValue', 'ObjectValue', 'RegExpValue',
    ]) {
      const Ctor = window.obsidian?.[name] as unknown as new (v?: unknown) => { toString(): string; isTruthy(): boolean }
      expect(Ctor, `window.obsidian.${name} should exist`).toBeTypeOf('function')
      class Sub extends (Ctor as unknown as new (v?: unknown) => object) {}
      const instance = new Sub('x') as { toString(): string; isTruthy(): boolean }
      expect(() => instance.toString()).not.toThrow()
      expect(() => instance.isTruthy()).not.toThrow()
    }
  })

  it('StringValue renders its text and reports truthiness', () => {
    const StringValue = window.obsidian?.['StringValue'] as unknown as new (v: unknown) => { toString(): string; isTruthy(): boolean }
    expect(new StringValue('hi').toString()).toBe('hi')
    expect(new StringValue('').isTruthy()).toBe(false)
  })

  it('NullValue.value is a singleton NullValue instance', () => {
    const NullValueCtor = window.obsidian?.['NullValue'] as unknown as { value: unknown; new (): unknown }
    expect(NullValueCtor.value).toBeInstanceOf(NullValueCtor)
  })
})

describe('Bases runtime classes on window.obsidian', () => {
  it('BasesView extends Component, keeps its container, and runs its lifecycle', () => {
    const BasesViewCtor = window.obsidian?.['BasesView'] as unknown as new (controller: unknown, el: HTMLElement) => {
      containerEl: HTMLElement; load(): void; unload(): void; onDataUpdated(): void
    }
    const ComponentCtor = window.obsidian?.['Component'] as unknown as new (...a: unknown[]) => unknown
    const el = document.createElement('div')
    const view = new BasesViewCtor({ app: {} }, el)
    expect(view).toBeInstanceOf(ComponentCtor)
    expect(view.containerEl).toBe(el)
    expect(() => { view.load(); view.onDataUpdated(); view.unload() }).not.toThrow()
  })

  it('BasesEntry.getValue returns a set Value and NullValue for absent keys', () => {
    const EntryCtor = window.obsidian?.['BasesEntry'] as unknown as new () => {
      setValue(k: string, v: unknown): void; getValue(k: string): { toString(): string }
    }
    const StringValue = window.obsidian?.['StringValue'] as unknown as new (v: unknown) => unknown
    const NullValueCtor = window.obsidian?.['NullValue'] as unknown as { value: unknown }
    const entry = new EntryCtor()
    entry.setValue('title', new StringValue('Alpha'))
    expect(entry.getValue('title').toString()).toBe('Alpha')
    expect(entry.getValue('missing')).toBe(NullValueCtor.value)
  })

  it('BasesQueryResult reports length and indexes into its entries', () => {
    const ResultCtor = window.obsidian?.['BasesQueryResult'] as unknown as new (entries: unknown[]) => {
      length(): number; get(i: number): unknown
    }
    const r = new ResultCtor(['a', 'b'])
    expect(r.length()).toBe(2)
    expect(r.get(0)).toBe('a')
  })

  it('QueryController extends Component', () => {
    const QueryControllerCtor = window.obsidian?.['QueryController'] as unknown as new (app: unknown) => unknown
    const ComponentCtor = window.obsidian?.['Component'] as unknown as new (...a: unknown[]) => unknown
    expect(new QueryControllerCtor({})).toBeInstanceOf(ComponentCtor)
  })
})

describe('Plugin.registerBasesView', () => {
  it('registers a view type (returns true) and makes it resolvable', () => {
    resetForVault()
    const PluginCtor = window.obsidian?.['Plugin'] as unknown as new (app: unknown, manifest: unknown) => {
      registerBasesView(id: string, registration: unknown): boolean
    }
    const plugin = new PluginCtor({}, { id: 'test-plugin' })
    const factory = (_c: unknown, el: HTMLElement) => ({ containerEl: el, onDataUpdated() {} })
    const stored = plugin.registerBasesView('my-view', { name: 'My View', factory })
    expect(stored).toBe(true)
    expect(getBasesViewRegistration('my-view')?.name).toBe('My View')
    resetForVault()
  })
})
