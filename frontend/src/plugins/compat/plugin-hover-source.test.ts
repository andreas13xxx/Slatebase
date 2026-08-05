/**
 * `Plugin.registerHoverLinkSource` and `workspace.registerHoverLinkSource` must
 * agree.
 *
 * Obsidian's Plugin method delegates to the workspace, and plugins reach for
 * whichever is closer to hand. When hover previews were implemented the
 * workspace side started registering sources for real while the Plugin side was
 * left warning "not implemented" and doing nothing — so the same call did two
 * different things depending on which object it went through.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { WorkspaceShim } from './shims/workspace-shim'
import { getHoverLinkSources, resetHoverLinkBus } from './hover-link-bus'

type PluginCtor = new () => {
  manifest: Record<string, unknown>
  registerHoverLinkSource(key: string, source?: unknown): void
  unregisterHoverLinkSource(key: string): void
}

function makePlugin(): InstanceType<PluginCtor> {
  installObsidianGlobals()
  const Plugin = (window.obsidian as Record<string, unknown>)['Plugin'] as PluginCtor
  const plugin = new Plugin()
  plugin.manifest = { id: 'test-plugin' }
  return plugin
}

describe('Plugin.registerHoverLinkSource', () => {
  beforeEach(() => resetHoverLinkBus())

  it('registers the source instead of warning that it is unimplemented', () => {
    const plugin = makePlugin()

    plugin.registerHoverLinkSource('kanban', { display: 'Kanban board' })

    expect(getHoverLinkSources()).toEqual([{ id: 'kanban', display: 'Kanban board' }])
  })

  it('withdraws the source again', () => {
    const plugin = makePlugin()
    plugin.registerHoverLinkSource('kanban', {})

    plugin.unregisterHoverLinkSource('kanban')

    expect(getHoverLinkSources()).toEqual([])
  })

  it('matches what the workspace route does', () => {
    const plugin = makePlugin()
    const workspace = new WorkspaceShim()

    plugin.registerHoverLinkSource('via-plugin', { display: 'A' })
    workspace.registerHoverLinkSource('via-workspace', { display: 'B' })

    const byRoute = Object.fromEntries(getHoverLinkSources().map((s) => [s.id, s.display]))
    expect(byRoute).toEqual({ 'via-plugin': 'A', 'via-workspace': 'B' })
  })

  it('falls back to the id when no display name is given', () => {
    const plugin = makePlugin()

    plugin.registerHoverLinkSource('plain')

    expect(getHoverLinkSources()[0]!.display).toBe('plain')
  })
})
