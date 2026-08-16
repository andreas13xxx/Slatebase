/**
 * Bases (Obsidian API since 1.10.0) is deliberately typed but not
 * functionally implemented — see obsidian-api-extensions.ts's version audit
 * trail. These tests pin down the "doesn't crash" contract: a plugin that
 * extends a Bases/Value class or registers a Bases view type at module-eval
 * time must not throw, and none of it does anything real.
 */
import { describe, it, expect } from 'vitest'
import { installObsidianGlobals } from './install-globals'

installObsidianGlobals()

describe('Bases stub classes', () => {
  it('exposes the Value hierarchy as constructible, extendable classes', () => {
    for (const name of [
      'Value', 'NotNullValue', 'NullValue', 'PrimitiveValue',
      'BooleanValue', 'NumberValue', 'StringValue',
      'HTMLValue', 'IconValue', 'ImageValue', 'LinkValue', 'TagValue', 'UrlValue',
      'DateValue', 'RelativeDateValue', 'DurationValue', 'FileValue', 'ListValue', 'ObjectValue', 'RegExpValue',
    ]) {
      const Ctor = window.obsidian?.[name] as unknown as new (v?: unknown) => { toString(): string; isTruthy(): boolean }
      expect(Ctor, `window.obsidian.${name} should exist`).toBeTypeOf('function')
      // A plugin extending this at module-eval time must not throw.
      class Sub extends (Ctor as unknown as new (v?: unknown) => object) {}
      const instance = new Sub('x') as { toString(): string; isTruthy(): boolean }
      expect(() => instance.toString()).not.toThrow()
      expect(() => instance.isTruthy()).not.toThrow()
    }
  })

  it('NullValue.value is a singleton NullValue instance', () => {
    const NullValueCtor = window.obsidian?.['NullValue'] as unknown as { value: unknown; new (): unknown }
    expect(NullValueCtor.value).toBeInstanceOf(NullValueCtor)
  })

  it('BasesView extends Component and never throws from its lifecycle no-ops', () => {
    const BasesViewCtor = window.obsidian?.['BasesView'] as unknown as new (controller: unknown, el: HTMLElement) => {
      containerEl: HTMLElement; load(): void; unload(): void; onDataUpdated(): void
    }
    const ComponentCtor = window.obsidian?.['Component'] as unknown as new (...a: unknown[]) => unknown
    const el = document.createElement('div')
    const view = new BasesViewCtor({}, el)
    expect(view).toBeInstanceOf(ComponentCtor)
    expect(view.containerEl).toBe(el)
    expect(() => { view.load(); view.onDataUpdated(); view.unload() }).not.toThrow()
  })

  it('QueryController extends Component', () => {
    const QueryControllerCtor = window.obsidian?.['QueryController'] as unknown as new (app: unknown) => unknown
    const ComponentCtor = window.obsidian?.['Component'] as unknown as new (...a: unknown[]) => unknown
    expect(new QueryControllerCtor({})).toBeInstanceOf(ComponentCtor)
  })

  it('Plugin.registerBasesView() is a no-op that never throws', () => {
    const PluginCtor = window.obsidian?.['Plugin'] as unknown as new (app: unknown, manifest: unknown) => {
      registerBasesView(id: string, registration: unknown): void
    }
    const plugin = new PluginCtor({}, { id: 'test-plugin' })
    expect(() => plugin.registerBasesView('my-view', { factory: () => { throw new Error('never called') } })).not.toThrow()
  })
})
