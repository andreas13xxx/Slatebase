import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { SidePanel } from './SidePanel'
import type { SidePanelDocumentProps, SidePanelSearchProps } from './SidePanel'
import { AuthContext, type AuthContextValue } from '../../state/authContext'
import { LeftPanelProvider } from '../../state/panelContext'
import { PluginContext } from '../../plugins/compat/plugin-context'
import type { PluginContextValue } from '../../plugins/compat/plugin-context'
import { savePanelLayout } from './utils/persistence'

/**
 * Regression coverage for the "disabled plugin leaves an orphaned sidebar tab"
 * bug: the sync effect (SidePanel.tsx) that reconciles panel tab state with
 * the plugin system's live `sidebarViews`/`leftSidebarViews` maps has a
 * fallback pass specifically for "a persisted layout still references a
 * plugin view that's no longer active" — but its `size > 0` guard skipped
 * exactly that case when both the current and previous view-type sets are
 * empty, which is what happens on every fresh mount of a panel whose plugin
 * was already deactivated while the panel was unmounted (e.g. the sidebar
 * was collapsed at the time, or the app was just reloaded).
 */

const USER_ID = 'u1'
const STORAGE_PREFIX = 'slatebase_sidebar_panel_'

function makeAuthValue(): AuthContextValue {
  return {
    authState: {
      isAuthenticated: true,
      user: {
        userId: USER_ID,
        username: 'testuser',
        displayName: 'Test User',
        email: 't@example.com',
        avatarUrl: '',
        role: 'admin',
        preferredLanguage: 'de',
        colorScheme: 'system',
        suspended: false,
        mustChangePassword: false,
      },
      token: 'test-token',
      csrfToken: 'test-csrf',
      mustChangePassword: false,
      isLoading: false,
      error: null,
    },
    authDispatch: () => {},
  } as unknown as AuthContextValue
}

function makePluginContextValue(): PluginContextValue {
  return {
    sidebarViews: new Map(),
    leftSidebarViews: new Map(),
    moveSidebarView: () => {},
  } as unknown as PluginContextValue
}

const documentPanel: SidePanelDocumentProps = {
  outline: { headings: [], activeAnchor: null },
  links: { forward: [], backlinks: [] },
  tags: { entries: [], loading: false },
  hasDocument: false,
  onHeadingClick: () => {},
  onLinkClick: () => {},
  onTagClick: () => {},
  onFileClick: () => {},
  onLinkMention: async () => {},
} as unknown as SidePanelDocumentProps

const search: SidePanelSearchProps = {
  vaults: [],
  selectedVaultId: null,
  hasWriteAccess: false,
  onNavigateToResult: () => {},
}

function renderLeftPanel() {
  return render(
    <AuthContext.Provider value={makeAuthValue()}>
      <PluginContext.Provider value={makePluginContextValue()}>
        <LeftPanelProvider>
          <SidePanel
            side="left"
            width={260}
            vaultId="vault1"
            onOpenFile={() => {}}
            renderExplorer={() => <div>explorer</div>}
            documentPanel={documentPanel}
            search={search}
            onMoveBuiltinView={() => {}}
          />
        </LeftPanelProvider>
      </PluginContext.Provider>
    </AuthContext.Provider>
  )
}

describe('SidePanel — stale persisted plugin tabs', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('removes a persisted plugin tab on mount when the plugin is not currently active', () => {
    // Seed a persisted layout as if "recent-files-obsidian" had a sidebar tab
    // open in a previous session, then got disabled before this mount.
    savePanelLayout(STORAGE_PREFIX, USER_ID, {
      tabOrder: ['explorer', 'favorites', 'recent', 'plugin:recent-files-toolbar'],
      sections: [{
        viewIds: ['explorer', 'favorites', 'recent', 'plugin:recent-files-toolbar'],
        activeViewId: 'explorer',
        heightFraction: 1,
      }],
    })

    const { container } = renderLeftPanel()

    expect(container.querySelector('[data-tab-id="plugin:recent-files-toolbar"]')).toBeNull()
  })

  it('keeps a persisted plugin tab whose plugin is still active', () => {
    savePanelLayout(STORAGE_PREFIX, USER_ID, {
      tabOrder: ['explorer', 'plugin:recent-files-toolbar'],
      sections: [{
        viewIds: ['explorer', 'plugin:recent-files-toolbar'],
        activeViewId: 'explorer',
        heightFraction: 1,
      }],
    })

    const { container } = render(
      <AuthContext.Provider value={makeAuthValue()}>
        <PluginContext.Provider value={{
          sidebarViews: new Map(),
          leftSidebarViews: new Map([['recent-files-toolbar', {
            viewType: 'recent-files-toolbar',
            displayText: 'Recent Files',
            icon: 'clock',
            containerEl: document.createElement('div'),
            leaf: {} as never,
          }]]),
          moveSidebarView: () => {},
        } as unknown as PluginContextValue}>
          <LeftPanelProvider>
            <SidePanel
              side="left"
              width={260}
              vaultId="vault1"
              onOpenFile={() => {}}
              renderExplorer={() => <div>explorer</div>}
              documentPanel={documentPanel}
              search={search}
              onMoveBuiltinView={() => {}}
            />
          </LeftPanelProvider>
        </PluginContext.Provider>
      </AuthContext.Provider>
    )

    expect(container.querySelector('[data-tab-id="plugin:recent-files-toolbar"]')).not.toBeNull()
  })
})
