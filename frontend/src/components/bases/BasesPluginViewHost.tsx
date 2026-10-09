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

import { useEffect, useRef } from 'react'
import type { IApiClient } from '../../api'
import type { BaseDocument, BaseView } from '../../bases/types'
import { getBasesViewRegistrationWithOwner } from '../../plugins/compat/bases-view-registry'
import { BasesQueryController, type DrivableBasesView } from '../../plugins/compat/bases-query-controller'
import { withPluginContext } from '../../plugins/compat/plugin-execution-context'

export interface BasesPluginViewHostProps {
  apiClient: IApiClient
  vaultId: string
  doc: BaseDocument
  /** The active view (its `type` matches a registered plugin view). */
  view: BaseView
  /** Open a note by its vault-relative path (wired into the view's RenderContext). */
  onOpenNote: (path: string) => void
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
  apiClient, vaultId, doc, view, onOpenNote, onError,
}: BasesPluginViewHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const owned = getBasesViewRegistrationWithOwner(view.type)
    if (!owned) {
      onError(`Keine Plugin-View für den Typ "${view.type}" registriert.`)
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
      const ConfigCtor = window.obsidian?.['BasesViewConfig'] as unknown as (new () => { name: string; setOrder?(o: string[]): void }) | undefined
      const config = ConfigCtor ? new ConfigCtor() : { name: view.name ?? 'Base' }
      config.name = view.name ?? view.type
      config.setOrder?.(view.order ?? Object.keys(doc.properties ?? {}))
      ;(queryController as { config?: unknown }).config = config

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
        apiClient, vaultId, doc, view, target: mounted,
        onError,
      })
      void controller.start()
    } catch (err) {
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
  }, [apiClient, vaultId, doc, view, onOpenNote, onError])

  return <div ref={containerRef} className="bases-view__plugin-container" />
}
