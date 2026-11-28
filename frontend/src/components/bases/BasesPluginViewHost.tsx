/**
 * BasesPluginViewHost — mounts a plugin-contributed Bases view.
 *
 * When a `.base` file's active view `type` matches a `registerBasesView()`
 * registration, this host instantiates the plugin's view (via its factory),
 * drives its Component lifecycle, and attaches a `BasesQueryController` that
 * feeds it the same rows the built-in table would show. The whole thing runs
 * inside the parent `BasesView`'s ErrorBoundary and a `data-plugin-id`-scoped
 * container, so a faulty plugin view degrades to the built-in table rather
 * than crashing the tab.
 *
 * The view is mounted imperatively into a ref'd container (same pattern as
 * `PluginViewPanel`): plugin views render their own DOM, not React children.
 */

import { translateNow } from '../../i18n'
import { useEffect, useRef } from 'react'
import type { IApiClient } from '../../api'
import type { BaseDocument, BaseView } from '@slatebase/shared-contracts'
import { getBasesViewRegistrationWithOwner } from '../../plugins/compat/bases-view-registry'
import { BasesQueryController, type DrivableBasesView } from '../../plugins/compat/bases-query-controller'
import { errorOnce, warnOnce } from '../../plugins/compat/log'
import { withPluginContext } from '../../plugins/compat/plugin-execution-context'

export interface BasesPluginViewHostProps {
  apiClient: IApiClient
  vaultId: string
  doc: BaseDocument
  /** The active view (its `type` matches a registered plugin view). */
  view: BaseView
  /** Vault-relative path of the host note `this` refers to (the embedding note, or the base file itself when opened on its own). Absent when there is no host. */
  hostPath?: string
  /** Open a note by its vault-relative path (wired into the view's RenderContext). */
  onOpenNote: (path: string) => void
  /** Create a note scoped to this base (and open it); resolves to its path, or null on failure. */
  onAddItem?: (overrides?: Record<string, string>, folderOverride?: string, baseName?: string) => Promise<string | null>
  /** Report a query/render error upward (shown by the parent BasesView). */
  onError: (message: string) => void
}

/** A plugin view instance plus the Component lifecycle methods we drive. */
interface MountedPluginView extends DrivableBasesView {
  containerEl?: HTMLElement
  app?: unknown
  config?: unknown
  load?(): void
  unload?(): void
  onload?(): void
  onunload?(): void
}

/**
 * Mounts the plugin view for the active view type. Rendering is imperative
 * (the plugin owns its DOM); React only provides the scoped container and
 * manages the mount/unmount lifecycle.
 */
export function BasesPluginViewHost({
  apiClient, vaultId, doc, view, hostPath, onOpenNote, onAddItem, onError,
}: BasesPluginViewHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Kept in a ref: the mount effect below must not re-run (and remount the
  // plugin view) just because `addItem` is rebuilt when the document changes.
  const addItemRef = useRef(onAddItem)
  useEffect(() => { addItemRef.current = onAddItem }, [onAddItem])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const owned = getBasesViewRegistrationWithOwner(view.type)
    if (!owned) {
      onError(translateNow('basesUi.noPluginView', { type: view.type }))
      return
    }
    const { registration, pluginId } = owned
    container.setAttribute('data-plugin-id', pluginId)
    container.textContent = ''

    let mounted: MountedPluginView | null = null
    let controller: BasesQueryController | null = null

    try {
      // Build the opaque QueryController the factory expects (the global base
      // class), tagging it with the shared app shim so controller.app works.
      const QueryControllerCtor = window.obsidian?.['QueryController'] as unknown as (new (app: unknown) => { app: unknown; config?: unknown }) | undefined
      const app = (window as unknown as { app?: unknown }).app
      const queryController = QueryControllerCtor ? new QueryControllerCtor(app) : { app }

      // Create a RenderContext-like config carrier so LinkValues can navigate.
      const ConfigCtor = window.obsidian?.['BasesViewConfig'] as unknown as (new () => {
        name: string
        setOrder?(o: string[]): void
        setSort?(s: Array<{ column: string; direction?: 'asc' | 'desc' }>): void
        setViewData?(key: string, value: unknown): void
      }) | undefined
      const config = ConfigCtor ? new ConfigCtor() : { name: view.name ?? 'Base' }
      config.name = view.name ?? view.type
      config.setOrder?.(view.order ?? Object.keys(doc.properties ?? {}))
      config.setSort?.(view.sort ?? [])
      const displayNames: Record<string, string> = {}
      for (const [key, prop] of Object.entries(doc.properties ?? {})) {
        if (prop?.displayName) displayNames[key] = prop.displayName
      }
      ;(config as { _displayNames?: Record<string, string> })._displayNames = displayNames
      // Feed the plugin view its per-view config. A plugin reads these through
      // `config.get(key)` / `config.getAsPropertyId(key)` (e.g. the Maps plugin
      // reads the `coordinates` marker property and its zoom/tile options), so
      // every known view field plus the `_unknown` passthrough bucket — where
      // the parser keeps fields it has no typed slot for, like `coordinates` —
      // must be copied into the config's data map, or the plugin view renders
      // empty despite mounting.
      if (typeof config.setViewData === 'function') {
        const forward: Record<string, unknown> = { ...(view._unknown ?? {}) }
        if (view.limit !== undefined) forward['limit'] = view.limit
        if (view.image !== undefined) forward['image'] = view.image
        if (view.imageFit !== undefined) forward['imageFit'] = view.imageFit
        if (view.imageAspectRatio !== undefined) forward['imageAspectRatio'] = view.imageAspectRatio
        if (view.cardSize !== undefined) forward['cardSize'] = view.cardSize
        if (view.columnWidth !== undefined) forward['columnWidth'] = view.columnWidth
        for (const [key, value] of Object.entries(forward)) config.setViewData(key, value)
      }
      ;(queryController as { config?: unknown }).config = config
      // Obsidian's controller exposes the parsed base as `query` (its `views`
      // with `name`/`groupBy`/…) plus the active `viewName`. TaskNotes' Kanban
      // reads the grouping from there, not from `config`, and otherwise shows
      // "requires a Group by property" despite a configured grouping.
      const viewName = view.name ?? view.type
      ;(queryController as { query?: unknown; viewName?: string }).query = {
        ...doc,
        views: (doc.views ?? []).map((v) => (v === view ? { ...v, name: viewName } : v)),
      }
      ;(queryController as { viewName?: string }).viewName = viewName
      // Backs `BasesView.createFileForView()`.
      ;(queryController as { _createFile?: unknown })._createFile = async (
        baseFileName?: string,
        processor?: (frontmatter: Record<string, unknown>, file: unknown) => void,
      ): Promise<void> => {
        const path = await addItemRef.current?.({}, undefined, baseFileName)
        if (!path || !processor) return
        const shim = app as {
          vault?: { getAbstractFileByPath?(p: string): unknown }
          fileManager?: { processFrontMatter?(f: unknown, fn: (fm: Record<string, unknown>) => void): Promise<void> }
        } | undefined
        const file = shim?.vault?.getAbstractFileByPath?.(path)
        if (!file || !shim?.fileManager?.processFrontMatter) {
          warnOnce('bases-create-file-processor', 'BasesView.createFileForView: the new note is not in the vault cache yet, so the frontmatter processor was skipped')
          return
        }
        await shim.fileManager.processFrontMatter(file, (fm) => processor(fm, file))
      }

      // Instantiate the plugin view inside the plugin's execution context so
      // any DOM it builds is tagged for CSS scoping.
      mounted = withPluginContext(pluginId, () =>
        registration.factory(queryController, container) as MountedPluginView
      )
      if (!mounted) { onError('Die Plugin-View konnte nicht erzeugt werden.'); return }
      mounted.config = config

      // Drive the Component lifecycle: load() → onload().
      withPluginContext(pluginId, () => {
        if (typeof mounted?.load === 'function') mounted.load()
        else mounted?.onload?.()
      })

      // Attach the data controller; its first query drives onDataUpdated().
      controller = new BasesQueryController({
        apiClient, vaultId, doc, view, hostPath, target: mounted,
        onError,
      })
      void controller.start()
    } catch (err) {
      // The banner carries only the message; the stack is what tells which plugin line threw.
      errorOnce(`bases-plugin-view:${view.type}`, `Bases plugin view "${view.type}" failed to start:`, err)
      onError(err instanceof Error ? err.message : 'Die Plugin-View ist fehlgeschlagen.')
    }

    return () => {
      controller?.stop()
      try {
        withPluginContext(pluginId, () => {
          if (typeof mounted?.unload === 'function') mounted.unload()
          else mounted?.onunload?.()
        })
      } catch { /* teardown errors must not break unmount */ }
      container.textContent = ''
      container.removeAttribute('data-plugin-id')
    }
  }, [apiClient, vaultId, doc, view, hostPath, onOpenNote, onError])

  return <div ref={containerRef} className="bases-view__plugin-container" />
}
