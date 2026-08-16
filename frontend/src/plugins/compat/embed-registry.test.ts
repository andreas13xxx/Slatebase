import { describe, it, expect, afterEach } from 'vitest'
import {
  embedByExtension,
  registerExtension,
  registerExtensions,
  unregisterExtension,
  unregisterExtensions,
  isExtensionRegistered,
  getEmbedCreator,
  getLinktextExtension,
  findEmbedCreatorForTarget,
  mountRegisteredEmbed,
  createEmbedRegistryShim,
  resetEmbedRegistry,
  seedKanbanMarkdownEmbed,
  type EmbedComponent,
  type EmbedContext,
} from './embed-registry'

/** A minimal, spec-conformant EmbedComponent for exercising the mount lifecycle. */
function makeComponent(overrides: Partial<EmbedComponent> = {}): EmbedComponent & { loaded: boolean; loadedFile: boolean; unloaded: boolean } {
  const state = { loaded: false, loadedFile: false, unloaded: false }
  return {
    ...state,
    load(): void { state.loaded = true },
    unload(): void { state.unloaded = true },
    loadFile(): void { state.loadedFile = true },
    ...overrides,
    get loaded() { return state.loaded },
    get loadedFile() { return state.loadedFile },
    get unloaded() { return state.unloaded },
  } as EmbedComponent & { loaded: boolean; loadedFile: boolean; unloaded: boolean }
}

afterEach(() => {
  resetEmbedRegistry()
  seedKanbanMarkdownEmbed()
})

describe('registerExtension / unregisterExtension', () => {
  it('registers a creator retrievable via getEmbedCreator', () => {
    const creator = () => makeComponent()
    registerExtension('note', creator)
    expect(getEmbedCreator({ extension: 'note' })).toBe(creator)
  })

  it('unregisters a single extension', () => {
    registerExtension('note', () => makeComponent())
    unregisterExtension('note')
    expect(isExtensionRegistered('note')).toBe(false)
  })

  it('registerExtensions registers the same creator for every extension in the list', () => {
    const creator = () => makeComponent()
    registerExtensions(['note', 'spd'], creator)
    expect(getEmbedCreator({ extension: 'note' })).toBe(creator)
    expect(getEmbedCreator({ extension: 'spd' })).toBe(creator)
  })

  it('unregisterExtensions removes every extension in the list', () => {
    registerExtensions(['note', 'spd'], () => makeComponent())
    unregisterExtensions(['note', 'spd'])
    expect(isExtensionRegistered('note')).toBe(false)
    expect(isExtensionRegistered('spd')).toBe(false)
  })

  it('a later registration for the same extension overwrites the earlier one', () => {
    const first = () => makeComponent()
    const second = () => makeComponent()
    registerExtension('note', first)
    registerExtension('note', second)
    expect(getEmbedCreator({ extension: 'note' })).toBe(second)
  })
})

describe('isExtensionRegistered / getEmbedCreator', () => {
  it('reports false / null for an extension nothing registered', () => {
    expect(isExtensionRegistered('nonexistent')).toBe(false)
    expect(getEmbedCreator({ extension: 'nonexistent' })).toBeNull()
  })

  it('getEmbedCreator returns null for a null/undefined file', () => {
    expect(getEmbedCreator(null)).toBeNull()
    expect(getEmbedCreator(undefined)).toBeNull()
  })
})

describe('embedByExtension', () => {
  it('is the same live object registerExtension writes into — a direct property read sees a plugin registration', () => {
    // Kanban's actual usage pattern: reading app.embedRegistry.embedByExtension.foo
    // directly, not through getEmbedCreator().
    const creator = () => makeComponent()
    registerExtension('foo', creator)
    expect(embedByExtension['foo']).toBe(creator)
  })
})

describe('getLinktextExtension', () => {
  it('extracts the extension from a simple filename', () => {
    expect(getLinktextExtension('Drawing.excalidraw')).toBe('excalidraw')
  })

  it('returns empty string for a bare name with no extension', () => {
    expect(getLinktextExtension('My Note')).toBe('')
  })

  it('lowercases the extension', () => {
    expect(getLinktextExtension('Drawing.EXCALIDRAW')).toBe('excalidraw')
  })

  it('ignores a dot in a parent folder name, not the filename', () => {
    expect(getLinktextExtension('v1.2/My Note')).toBe('')
  })

  it('strips a #heading or ?query suffix before looking for the extension', () => {
    expect(getLinktextExtension('Drawing.excalidraw#Section')).toBe('excalidraw')
  })
})

describe('findEmbedCreatorForTarget', () => {
  it('matches on the apparent link-text extension (e.g. "excalidraw" from "Drawing.excalidraw")', () => {
    // Regression coverage for the case that actually motivated this registry:
    // a plugin whose files are saved as "name.excalidraw.md" but whose
    // wikilink target omits the trailing .md, so the *resolved* file's real
    // extension is "md" while the apparent one in the link text is "excalidraw".
    const creator = () => makeComponent()
    registerExtension('excalidraw', creator)
    expect(findEmbedCreatorForTarget('Drawing.excalidraw', 'md')).toBe(creator)
  })

  it('falls back to the resolved file extension when the link text has none', () => {
    const creator = () => makeComponent()
    registerExtension('note', creator)
    expect(findEmbedCreatorForTarget('MyNote', 'note')).toBe(creator)
  })

  it('returns null when neither extension is registered', () => {
    expect(findEmbedCreatorForTarget('Plain Note', 'md')).toBeNull()
  })

  it('never matches "md" — an ordinary note embed must not be hijacked by a plugin registered under "md" (e.g. the seeded Kanban hack)', () => {
    // "md" is always seeded (see seedKanbanMarkdownEmbed) — this is the
    // regression this test guards: without the exclusion, every plain
    // `![[Some Note]]` embed (resolved extension "md") would match it.
    expect(findEmbedCreatorForTarget('Some Note', 'md')).toBeNull()
    expect(findEmbedCreatorForTarget('Some Note.md', 'md')).toBeNull()
  })
})

describe('mountRegisteredEmbed', () => {
  it('calls load() then loadFile() on the component the creator returns', () => {
    const component = makeComponent()
    const creator = () => component
    const context: EmbedContext = { app: {}, containerEl: document.createElement('div') }
    const result = mountRegisteredEmbed(creator, context, 'Drawing.excalidraw.md')
    expect(result).toBe(component)
    expect(component.loaded).toBe(true)
    expect(component.loadedFile).toBe(true)
  })

  it('passes context, a TFile built from the given path, and subpath through to the creator', () => {
    let received: unknown[] = []
    const creator = (...args: unknown[]) => {
      received = args
      return makeComponent()
    }
    const context: EmbedContext = { app: {}, containerEl: document.createElement('div') }
    mountRegisteredEmbed(creator, context, 'Folder/Drawing.excalidraw.md', '#^block1')
    expect(received[0]).toBe(context)
    expect(received[1]).toMatchObject({ path: 'Folder/Drawing.excalidraw.md', name: 'Drawing.excalidraw.md', extension: 'md' })
    expect(received[2]).toBe('#^block1')
  })

  it('returns null and does not throw when the creator itself throws', () => {
    const creator = () => { throw new Error('boom') }
    const context: EmbedContext = { app: {}, containerEl: document.createElement('div') }
    expect(() => mountRegisteredEmbed(creator, context, 'Drawing.excalidraw.md')).not.toThrow()
    expect(mountRegisteredEmbed(creator, context, 'Drawing.excalidraw.md')).toBeNull()
  })

  it('works with a component that has no loadFile (e.g. the seeded Kanban entry)', () => {
    const component = makeComponent({ loadFile: undefined })
    const creator = () => component
    const context: EmbedContext = { app: {}, containerEl: document.createElement('div') }
    expect(() => mountRegisteredEmbed(creator, context, 'x.md')).not.toThrow()
  })
})

describe('createEmbedRegistryShim', () => {
  it('produces a fresh object each call that reads/writes the same shared embedByExtension record', () => {
    const shimA = createEmbedRegistryShim()
    const shimB = createEmbedRegistryShim()
    expect(shimA).not.toBe(shimB)

    const creator = () => makeComponent()
    shimA.registerExtension('shared-ext', creator)
    expect(shimB.getEmbedCreator({ extension: 'shared-ext' })).toBe(creator)
    expect(shimB.embedByExtension['shared-ext']).toBe(creator)
  })
})

describe('seedKanbanMarkdownEmbed', () => {
  it('seeds embedByExtension.md with a callable factory', () => {
    resetEmbedRegistry()
    expect(isExtensionRegistered('md')).toBe(false)
    seedKanbanMarkdownEmbed()
    expect(isExtensionRegistered('md')).toBe(true)
    expect(typeof embedByExtension['md']).toBe('function')
  })

  it('does not overwrite a real plugin registration already present under "md"', () => {
    resetEmbedRegistry()
    const pluginCreator = () => makeComponent()
    registerExtension('md', pluginCreator)
    seedKanbanMarkdownEmbed()
    expect(embedByExtension['md']).toBe(pluginCreator)
  })
})
