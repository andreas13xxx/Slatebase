/**
 * EmbedRegistry — Obsidian-compatible `app.embedRegistry`.
 *
 * Undocumented core API (absent from the public `obsidian.d.ts`) that plugins
 * use to render custom, non-Markdown embed types inline for `![[file.ext]]` —
 * the same registry Obsidian's own image/PDF/canvas embeds are wired through.
 * Real plugins that rely on it: Supernote, tldraw, PDF++, drawio,
 * canvas-cover-overlay, and generic helpers like obsidian-dev-utils's
 * `EmbedExtensionsComponent`.
 *
 * Shape cross-checked against obsidian-typings and those real plugins'
 * source (registerExtension/registerExtensions/unregisterExtension/
 * unregisterExtensions/isExtensionRegistered/getEmbedCreator/embedByExtension,
 * and the `(context, file, subpath) => EmbedComponent` creator signature).
 *
 * @module embed-registry
 */

import type { TFile } from './types'
import { buildTFileFromPath } from './plugin-event-bridge'
import { errorOnce } from './log'

/** Context handed to an EmbedCreator — mirrors Obsidian's undocumented EmbedContext. */
export interface EmbedContext {
  app: unknown
  containerEl: HTMLElement
  depth?: number
  displayMode?: boolean
  linktext?: string
  showInline?: boolean
  sourcePath?: string
  state?: unknown
}

/**
 * The Component-like object an EmbedCreator returns. `loadFile` is the
 * actual (re-runnable) render trigger real embed implementations use,
 * called separately from `load()`/`onload()` so the same instance can
 * reload without being torn down — but it's optional here because at least
 * one real-world `embedByExtension` entry (Kanban's `md` extraction hack,
 * seeded in app-shim.ts) doesn't implement it: that entry is never invoked
 * through the normal embed pipeline, so requiring the field would make a
 * faithful reproduction of that entry a type error.
 */
export interface EmbedComponent {
  load?(): void
  unload?(): void
  onload?(): void
  onunload?(): void
  loadFile?(): void | Promise<void>
  [key: string]: unknown
}

export type EmbedCreator = (context: EmbedContext, file: TFile, subpath?: string) => EmbedComponent

/**
 * Live, directly mutable — real Obsidian exposes this as a plain object, and
 * at least one plugin (Kanban) reads it as a property rather than through
 * `getEmbedCreator()`, so this must be the same object reference every
 * caller sees, not a snapshot.
 */
export const embedByExtension: Record<string, EmbedCreator> = {}

/** Registers an embed creator for one extension (no leading dot, e.g. "excalidraw"). */
export function registerExtension(extension: string, creator: EmbedCreator): void {
  embedByExtension[extension] = creator
}

/** Registers the same embed creator for multiple extensions at once. */
export function registerExtensions(extensions: string[], creator: EmbedCreator): void {
  for (const extension of extensions) registerExtension(extension, creator)
}

export function unregisterExtension(extension: string): void {
  delete embedByExtension[extension]
}

export function unregisterExtensions(extensions: string[]): void {
  for (const extension of extensions) unregisterExtension(extension)
}

export function isExtensionRegistered(extension: string): boolean {
  return extension in embedByExtension
}

/** Looks up the creator registered for a resolved file's extension, or null. */
export function getEmbedCreator(file: { extension: string } | null | undefined): EmbedCreator | null {
  if (!file) return null
  return embedByExtension[file.extension] ?? null
}

/**
 * Extension key parsed from a raw embed link target (e.g. "excalidraw" from
 * "Drawing.excalidraw"), lowercased and without the leading dot. Empty
 * string when the target has no extension-like suffix.
 */
export function getLinktextExtension(target: string): string {
  const base = target.split(/[?#]/)[0] ?? target
  const lastDot = base.lastIndexOf('.')
  const lastSlash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'))
  if (lastDot <= lastSlash) return ''
  return base.slice(lastDot + 1).toLowerCase()
}

/**
 * Extension excluded from findEmbedCreatorForTarget's lookup: "md" is what
 * Slatebase's own native note-embed pipeline (ViewMode/NoteEmbed and Live
 * Preview's buildNoteDOM — headings, block-refs, recursive rendering) is
 * built for, and it's also the resolved extension of every ordinary note
 * (`![[Some Note]]` resolves to "Some Note.md"). It's excluded from the
 * lookup unconditionally, not just while it holds the Kanban seed: a
 * registration under "md" is still fully visible via getEmbedCreator() /
 * embedByExtension.md for a plugin that wants it directly (matching Obsidian,
 * where `embedByExtension` is a plain object with no reserved keys) — this
 * exclusion only keeps Slatebase's own render pipeline from treating every
 * plain note embed as a plugin embed the moment anything is registered
 * under "md".
 */
const RENDER_LOOKUP_EXCLUDED_EXTENSION = 'md'

/**
 * Looks up a registered embed creator for a wikilink embed target, checking
 * the apparent extension in the link text first (e.g. "excalidraw" from
 * "Drawing.excalidraw" — the case a plugin whose files are saved with a
 * double extension like ".excalidraw.md" needs, since the resolved file's
 * *real* extension there is "md"), then the resolved file's actual
 * extension. Which one Obsidian itself keys on is undocumented; checking
 * both maximizes plugin compatibility without misclassifying an ordinary
 * note embed, which matches neither — except "md" itself, see
 * RENDER_LOOKUP_EXCLUDED_EXTENSION above.
 */
export function findEmbedCreatorForTarget(target: string, resolvedExtension: string): EmbedCreator | null {
  const linktextExtension = getLinktextExtension(target)
  const byLinktext = linktextExtension && linktextExtension !== RENDER_LOOKUP_EXCLUDED_EXTENSION
    ? embedByExtension[linktextExtension]
    : undefined
  if (byLinktext) return byLinktext
  const byResolved = resolvedExtension && resolvedExtension !== RENDER_LOOKUP_EXCLUDED_EXTENSION
    ? embedByExtension[resolvedExtension]
    : undefined
  return byResolved ?? null
}

/**
 * Instantiates a registered embed and runs the Component lifecycle real
 * Obsidian uses on it: `load()` (→ `onload()`), then `loadFile()`. Returns
 * the component so the caller can `unload()` it on cleanup, or null if the
 * creator threw — a faulty plugin must not break the embed pipeline for
 * everyone else.
 */
export function mountRegisteredEmbed(
  creator: EmbedCreator,
  context: EmbedContext,
  filePath: string,
  subpath?: string,
): EmbedComponent | null {
  try {
    const file = buildTFileFromPath(filePath)
    const component = creator(context, file, subpath)
    component.load?.()
    const result = component.loadFile?.()
    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        errorOnce('EmbedRegistry.loadFileError', '[EmbedRegistry] loadFile() failed:', err)
      })
    }
    return component
  } catch (err) {
    errorOnce('EmbedRegistry.creatorError', '[EmbedRegistry] Embed creator threw:', err)
    return null
  }
}

/** Clears all registrations. Test-only. */
export function resetEmbedRegistry(): void {
  for (const key of Object.keys(embedByExtension)) delete embedByExtension[key]
}

/**
 * Builds the `app.embedRegistry` shim object — the same shape every consumer
 * needs (AppShim's `this.app.embedRegistry`, and `window.app.embedRegistry`
 * in plugin-context.ts). A factory rather than one shared object literal so
 * each `App`-shaped stub gets its own object identity (matching Obsidian,
 * where `embedRegistry` is a real class instance) while every instance still
 * reads and writes the same underlying `embedByExtension` record — a plugin
 * registering through `this.app.embedRegistry` must be visible to a view
 * reached through `window.app.embedRegistry`, and vice versa.
 */
export function createEmbedRegistryShim(): {
  embedByExtension: Record<string, EmbedCreator>
  registerExtension: typeof registerExtension
  registerExtensions: typeof registerExtensions
  unregisterExtension: typeof unregisterExtension
  unregisterExtensions: typeof unregisterExtensions
  isExtensionRegistered: typeof isExtensionRegistered
  getEmbedCreator: typeof getEmbedCreator
} {
  return {
    embedByExtension,
    registerExtension,
    registerExtensions,
    unregisterExtension,
    unregisterExtensions,
    isExtensionRegistered,
    getEmbedCreator,
  }
}

/**
 * Seeds `embedByExtension.md` with Kanban's card-editor extraction hack:
 * Kanban reads that property directly (bypassing `getEmbedCreator()` and the
 * normal `(context, file, subpath)` creator contract entirely) to pull the
 * MarkdownEditor class out of the prototype chain for its inline card
 * editors. The FakeEditor below builds a real CodeMirror 6 EditorView so
 * Kanban's `.set()`/`.get()`/`.cm.dispatch()`/etc. calls work.
 *
 * Runs once, here at module load, rather than from any one consumer (like
 * AppShim's constructor) — `embedByExtension` is shared across every
 * `this.app`/`window.app` stub, and every one of them imports this module,
 * so seeding on import (guarded by `isExtensionRegistered`) guarantees the
 * default exists before any consumer could possibly read it, regardless of
 * which shim happens to be constructed first. A real plugin's later
 * `registerExtension('md', ...)` call legitimately overwrites it — same as
 * it would in real Obsidian, and it would equally break Kanban's hack there.
 */
export function seedKanbanMarkdownEmbed(): void {
  if (isExtensionRegistered('md')) return
  registerExtension('md', (): EmbedComponent => {
    const FakeEditor = class {
      cm: unknown
      containerEl: HTMLElement
      owner: unknown
      // Real Obsidian's MarkdownEditor exposes `win` (the window owning its DOM,
      // for popout-window support) — Kanban's card editor reads `this.win.setTimeout`
      // directly in its own focus handling. Without it, focusing a card editor throws
      // "can't access property setTimeout, this.win is undefined".
      win: Window
      // Real Obsidian's MarkdownEditor stores the constructor's `app` argument as
      // `this.app` — Kanban's card-editor subclass relies on inheriting it rather
      // than setting its own, and reads `this.app.workspace` from event handlers
      // (e.g. on focus). Without it, those handlers throw "can't access property
      // workspace, this.app is undefined".
      app: unknown
      constructor(...args: unknown[]) {
        // Real Obsidian's MarkdownEditor is constructed as (app, containerEl, config) —
        // Kanban's subclass forwards all of its own (app, containerEl, owner) args via
        // `super(...arguments)`, so the container is the second argument, not the first.
        // Scan for whichever argument is actually an element instead of assuming position,
        // since other plugins reusing this same API may call it with a different arity.
        const containerEl = args.find((a): a is HTMLElement => a instanceof HTMLElement)
        this.containerEl = containerEl ?? document.createElement('div')
        this.app = args[0]
        this.owner = args[2]
        this.win = this.containerEl.ownerDocument?.defaultView ?? window
        // Lazy-init CM6: dynamically import to avoid top-level dep issues
        this.cm = null
        try {
          const cmView = (globalThis as unknown as { __codemirrorView?: Record<string, unknown> }).__codemirrorView
          const cmState = (globalThis as unknown as { __codemirrorState?: { EditorState: unknown } }).__codemirrorState
          if (cmView && cmState) {
            const EV = cmView.EditorView as (new (config: unknown) => { state: { doc: { length: number; toString(): string } }; dispatch(tr: unknown): void; destroy(): void; focus(): void }) & { theme(spec: Record<string, unknown>): unknown }
            const ES = cmState.EditorState as { create(config: unknown): unknown }
            // Real Obsidian's MarkdownEditor calls `this.buildLocalExtensions()` here to
            // assemble the CM6 extension set — it's a protected hook subclasses override
            // to add their own keymaps/handlers. Kanban's subclass (see the `y extends
            // c.plugin.MarkdownEditor` wrapper around this class) overrides it to push an
            // Enter/Escape keymap that submits the card/list instead of inserting a
            // newline, plus a placeholder and focus/blur handlers. Building the state
            // directly here instead of going through this method — as an earlier version
            // of this shim did — silently drops every one of those overrides: Kanban's
            // keymap never got registered, so Enter fell through to CM6's native
            // newline-insertion instead of calling Kanban's submit handler.
            const extensions = this.buildLocalExtensions()
            const state = ES.create({ doc: '', extensions })
            this.cm = new EV({ state, parent: this.containerEl })
          }
        } catch { /* CM6 not available — cm stays null */ }
      }
      buildLocalExtensions(): unknown[] {
        const cmView = (globalThis as unknown as { __codemirrorView?: Record<string, unknown> }).__codemirrorView
        if (!cmView) return []
        const EV = cmView.EditorView as { theme(spec: Record<string, unknown>): unknown }
        // CM6 only draws a visible cursor via the `drawSelection` extension — without it
        // the editor is fully functional (focus, typing, selection) but renders no caret
        // at all, which is invisible rather than "subtly wrong" and easy to miss in a
        // quick look. Its default cursor color also only adapts to `.cm-dark`/`.cm-light`
        // classes this bare editor never gets, so it'd paint a black caret that's
        // invisible on Slatebase's dark theme even once drawn — hence the explicit
        // theme() pinning caret/cursor color to the app's text color variable instead,
        // which tracks light/dark automatically.
        const drawSelection = cmView.drawSelection as (() => unknown) | undefined
        return [
          EV.theme({
            '.cm-content': { caretColor: 'var(--text-primary)' },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text-primary)' },
          }),
          ...(typeof drawSelection === 'function' ? [drawSelection()] : []),
        ]
      }
      set(value: string) {
        const cm = this.cm as { state: { doc: { length: number } }; dispatch(tr: unknown): void } | null
        if (cm) {
          cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: value } })
        }
      }
      get(): string {
        const cm = this.cm as { state: { doc: { toString(): string } } } | null
        return cm ? cm.state.doc.toString() : ''
      }
      destroy() {
        const cm = this.cm as { destroy(): void } | null
        if (cm) cm.destroy()
      }
      getDoc() { return { getValue: () => this.get() } }
      clear() { this.set('') }
      focus() {
        const cm = this.cm as { focus(): void } | null
        if (cm) cm.focus()
      }
    }
    const editMode = Object.create(Object.create(FakeEditor.prototype))
    return {
      load: () => {},
      unload: () => {},
      editable: false,
      showEditor: () => {},
      editMode,
    }
  })
}
seedKanbanMarkdownEmbed()
