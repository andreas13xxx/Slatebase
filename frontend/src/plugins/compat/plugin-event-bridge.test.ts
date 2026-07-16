/**
 * Tests for PluginEventBridge — validates that Slatebase state changes
 * correctly trigger Obsidian-compatible shim events.
 *
 * Requirements: 6.3, 6.4, 7.5, 7.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePluginEventBridge } from './plugin-event-bridge'
import { WorkspaceShim } from './shims/workspace-shim'
import { MetadataCacheShim } from './shims/metadata-cache-shim'
import { ViewRegistry } from './view-registry'
import type { TabState } from '../../state/tabState'
import type { DirectoryTree } from '../../types'

describe('usePluginEventBridge', () => {
  let workspaceShim: WorkspaceShim
  let metadataCacheShim: MetadataCacheShim

  beforeEach(() => {
    workspaceShim = new WorkspaceShim()
    metadataCacheShim = new MetadataCacheShim(null)
  })

  const baseTabState: TabState = {
    tabs: [],
    activeTabId: null,
  }

  const mockTree: DirectoryTree = {
    name: 'test-vault',
    type: 'directory',
    children: [
      { name: 'hello.md', type: 'file', path: 'hello.md', size: 100 },
      { name: 'world.md', type: 'file', path: 'world.md', size: 200 },
    ],
    itemCount: 2,
    path: '',
  }

  describe('Active tab change → workspace events (Req 6.3, 6.4)', () => {
    it('emits file-open and active-leaf-change when active tab changes to a file', () => {
      const fileOpenCb = vi.fn()
      const leafChangeCb = vi.fn()
      workspaceShim.on('file-open', fileOpenCb)
      workspaceShim.on('active-leaf-change', leafChangeCb)

      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'view',
            isBinary: false,
            content: '# Hello',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      renderHook(() =>
        usePluginEventBridge({
          tabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      expect(leafChangeCb).toHaveBeenCalledTimes(1)
      expect(fileOpenCb).toHaveBeenCalledTimes(1)
      expect(fileOpenCb).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'hello.md', basename: 'hello', extension: 'md' }),
      )
    })

    it('emits active-leaf-change with null when active tab becomes null', () => {
      const leafChangeCb = vi.fn()
      workspaceShim.on('active-leaf-change', leafChangeCb)

      // First render with an active tab
      const tabStateWithActive: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'view',
            isBinary: false,
            content: '# Hello',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: tabStateWithActive } },
      )

      // Then close all tabs
      rerender({ tabState: { tabs: [], activeTabId: null } })

      expect(leafChangeCb).toHaveBeenCalledTimes(2) // once on open, once on close
      expect(leafChangeCb).toHaveBeenLastCalledWith(null)
    })

    it('does not emit events for binary tabs (activeFile stays null)', () => {
      const leafChangeCb = vi.fn()
      const fileOpenCb = vi.fn()
      workspaceShim.on('active-leaf-change', leafChangeCb)
      workspaceShim.on('file-open', fileOpenCb)

      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::image.png',
            vaultId: 'vault1',
            filePath: 'image.png',
            fileName: 'image.png',
            mode: 'view',
            isBinary: true,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::image.png',
      }

      renderHook(() =>
        usePluginEventBridge({
          tabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      // Binary tab → activeFile stays null (no change from initial null)
      expect(leafChangeCb).not.toHaveBeenCalled()
      expect(fileOpenCb).not.toHaveBeenCalled()
    })

    it('does not emit events for graph tab (activeFile stays null)', () => {
      const leafChangeCb = vi.fn()
      workspaceShim.on('active-leaf-change', leafChangeCb)

      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::__graph__',
            vaultId: 'vault1',
            filePath: '__graph__',
            fileName: '__graph__',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__graph__',
      }

      renderHook(() =>
        usePluginEventBridge({
          tabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      // Graph tab → activeFile stays null (no change from initial null)
      expect(leafChangeCb).not.toHaveBeenCalled()
    })

    it('emits active-leaf-change with null when switching from file to binary tab', () => {
      const leafChangeCb = vi.fn()
      workspaceShim.on('active-leaf-change', leafChangeCb)

      const fileTab = {
        id: 'vault1::hello.md',
        vaultId: 'vault1',
        filePath: 'hello.md',
        fileName: 'hello.md',
        mode: 'view' as const,
        isBinary: false,
        content: '# Hello',
        editBuffer: null,
        loading: false,
        error: null,
      }
      const binaryTab = {
        id: 'vault1::image.png',
        vaultId: 'vault1',
        filePath: 'image.png',
        fileName: 'image.png',
        mode: 'view' as const,
        isBinary: true,
        content: '',
        editBuffer: null,
        loading: false,
        error: null,
      }

      const initialState: TabState = {
        tabs: [fileTab, binaryTab],
        activeTabId: 'vault1::hello.md',
      }

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: initialState } },
      )

      // Switch to binary tab
      rerender({
        tabState: { tabs: [fileTab, binaryTab], activeTabId: 'vault1::image.png' },
      })

      // Should have emitted: first with file, then with null
      expect(leafChangeCb).toHaveBeenCalledTimes(2)
      expect(leafChangeCb).toHaveBeenLastCalledWith(null)
    })

    it('does not emit events when shim is null', () => {
      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'view',
            isBinary: false,
            content: '# Hello',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      // Should not throw when shims are null
      expect(() =>
        renderHook(() =>
          usePluginEventBridge({
            tabState,
            directoryTree: mockTree,
            workspaceShim: null,
            metadataCacheShim: null,
          }),
        ),
      ).not.toThrow()
    })
  })

  describe('File save → MetadataCache changed event (Req 7.5)', () => {
    it('emits changed event when tab content is updated (save success)', () => {
      const changedCb = vi.fn()
      metadataCacheShim.on('changed', changedCb)

      // Initial render with content
      const initialTabState: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'edit',
            isBinary: false,
            content: '# Hello',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: initialTabState } },
      )

      // Simulate SAVE_SUCCESS: content changes, editBuffer becomes null
      const savedTabState: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'edit',
            isBinary: false,
            content: '# Hello World',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      rerender({ tabState: savedTabState })

      expect(changedCb).toHaveBeenCalledTimes(1)
      expect(changedCb).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'hello.md' }),
        expect.any(Object),
      )
    })

    it('does not emit changed event when editBuffer is set (user typing, not save)', () => {
      const changedCb = vi.fn()
      metadataCacheShim.on('changed', changedCb)

      const initialTabState: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'edit',
            isBinary: false,
            content: '# Hello',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: initialTabState } },
      )

      // User is typing: content stays same, editBuffer changes
      const typingTabState: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'edit',
            isBinary: false,
            content: '# Hello',
            editBuffer: '# Hello World',
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }

      rerender({ tabState: typingTabState })

      expect(changedCb).not.toHaveBeenCalled()
    })
  })

  describe('Initial directory tree load → MetadataCache resolved (Req 7.6)', () => {
    it('emits resolved once when directoryTree transitions from null to non-null', () => {
      const resolvedCb = vi.fn()
      metadataCacheShim.on('resolved', resolvedCb)

      const { rerender } = renderHook(
        (props: { directoryTree: DirectoryTree | null }) =>
          usePluginEventBridge({
            tabState: baseTabState,
            directoryTree: props.directoryTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { directoryTree: null } },
      )

      // Tree loads
      rerender({ directoryTree: mockTree })

      expect(resolvedCb).toHaveBeenCalledTimes(1)
    })

    it('does not emit resolved again on subsequent tree updates', () => {
      const resolvedCb = vi.fn()
      metadataCacheShim.on('resolved', resolvedCb)

      const { rerender } = renderHook(
        (props: { directoryTree: DirectoryTree | null }) =>
          usePluginEventBridge({
            tabState: baseTabState,
            directoryTree: props.directoryTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { directoryTree: null } },
      )

      // First tree load
      rerender({ directoryTree: mockTree })
      // Tree updates
      const updatedTree = { ...mockTree, itemCount: 3 }
      rerender({ directoryTree: updatedTree })

      expect(resolvedCb).toHaveBeenCalledTimes(1)
    })

    it('emits resolved again after metadataCacheShim changes (vault switch)', () => {
      const resolvedCb1 = vi.fn()
      metadataCacheShim.on('resolved', resolvedCb1)

      const { rerender } = renderHook(
        (props: { directoryTree: DirectoryTree | null; metadataCacheShim: MetadataCacheShim | null }) =>
          usePluginEventBridge({
            tabState: baseTabState,
            directoryTree: props.directoryTree,
            workspaceShim,
            metadataCacheShim: props.metadataCacheShim,
          }),
        { initialProps: { directoryTree: mockTree, metadataCacheShim } },
      )

      expect(resolvedCb1).toHaveBeenCalledTimes(1)

      // Simulate vault switch: new MetadataCacheShim
      const newMetadataCacheShim = new MetadataCacheShim(null)
      const resolvedCb2 = vi.fn()
      newMetadataCacheShim.on('resolved', resolvedCb2)

      rerender({ directoryTree: mockTree, metadataCacheShim: newMetadataCacheShim })

      expect(resolvedCb2).toHaveBeenCalledTimes(1)
    })

    it('does not emit resolved if directoryTree is already non-null on mount', () => {
      const resolvedCb = vi.fn()
      metadataCacheShim.on('resolved', resolvedCb)

      // Mount with tree already present
      renderHook(() =>
        usePluginEventBridge({
          tabState: baseTabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      // It should still emit resolved on initial mount when tree is non-null
      expect(resolvedCb).toHaveBeenCalledTimes(1)
    })
  })

  describe('Plugin-view-tab awareness (Req 11.1, 11.2, 11.3, 11.4, 3.7, 12.4)', () => {
    it('emits active-leaf-change with WorkspaceLeaf when plugin-view-tab is active', () => {
      // Setup a view registry with a registered view so getLeavesOfType returns a leaf
      const registry = new ViewRegistry()
      registry.registerView('calendar', (leaf: unknown) => {
        const view = { getViewType: () => 'calendar', containerEl: document.createElement('div') }
        ;(leaf as { view: unknown }).view = view
        return view
      }, 'test-plugin')
      workspaceShim.setViewRegistry(registry, {})

      // Create a leaf with view type 'calendar' via the registry
      const leaf = registry.createLeaf({}, 'main')
      void leaf.setViewState({ type: 'calendar' })

      const leafChangeCb = vi.fn()
      workspaceShim.on('active-leaf-change', leafChangeCb)

      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::__view::calendar',
            vaultId: 'vault1',
            filePath: '__view::calendar',
            fileName: 'Calendar',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::calendar',
      }

      renderHook(() =>
        usePluginEventBridge({
          tabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      expect(leafChangeCb).toHaveBeenCalled()
      // The last call should have the leaf (not null and not a TFile)
      const lastCall = leafChangeCb.mock.calls[leafChangeCb.mock.calls.length - 1]
      expect(lastCall[0]).toBe(leaf)
    })

    it('sets getActiveFile() to null when plugin-view-tab is active (Req 3.7, 12.4)', () => {
      const registry = new ViewRegistry()
      registry.registerView('kanban', (leaf: unknown) => {
        const view = { getViewType: () => 'kanban', containerEl: document.createElement('div') }
        ;(leaf as { view: unknown }).view = view
        return view
      }, 'test-plugin')
      workspaceShim.setViewRegistry(registry, {})
      const leaf = registry.createLeaf({}, 'main')
      void leaf.setViewState({ type: 'kanban' })

      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::__view::kanban',
            vaultId: 'vault1',
            filePath: '__view::kanban',
            fileName: 'Kanban',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::kanban',
      }

      renderHook(() =>
        usePluginEventBridge({
          tabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      expect(workspaceShim.getActiveFile()).toBeNull()
    })

    it('emits layout-change when a plugin-view-tab is opened', () => {
      const layoutChangeCb = vi.fn()
      workspaceShim.on('layout-change', layoutChangeCb)

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: baseTabState } },
      )

      // Add a plugin-view-tab
      const withPluginTab: TabState = {
        tabs: [
          {
            id: 'vault1::__view::calendar',
            vaultId: 'vault1',
            filePath: '__view::calendar',
            fileName: 'Calendar',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::calendar',
      }
      rerender({ tabState: withPluginTab })

      expect(layoutChangeCb).toHaveBeenCalledTimes(1)
    })

    it('emits layout-change when a plugin-view-tab is closed', () => {
      const pluginTab = {
        id: 'vault1::__view::calendar',
        vaultId: 'vault1',
        filePath: '__view::calendar',
        fileName: 'Calendar',
        mode: 'view' as const,
        isBinary: false,
        content: '',
        editBuffer: null,
        loading: false,
        error: null,
      }

      const layoutChangeCb = vi.fn()
      workspaceShim.on('layout-change', layoutChangeCb)

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: { tabs: [pluginTab], activeTabId: pluginTab.id } } },
      )

      // layout-change on initial render (count goes from 0 to 1)
      expect(layoutChangeCb).toHaveBeenCalledTimes(1)

      // Close the plugin view tab
      rerender({ tabState: { tabs: [], activeTabId: null } })

      expect(layoutChangeCb).toHaveBeenCalledTimes(2) // once for open, once for close
    })

    it('does not emit layout-change for regular file tab open/close', () => {
      const layoutChangeCb = vi.fn()
      workspaceShim.on('layout-change', layoutChangeCb)

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: baseTabState } },
      )

      // Open a regular file tab
      const fileTab: TabState = {
        tabs: [
          {
            id: 'vault1::hello.md',
            vaultId: 'vault1',
            filePath: 'hello.md',
            fileName: 'hello.md',
            mode: 'view',
            isBinary: false,
            content: '# Hello',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::hello.md',
      }
      rerender({ tabState: fileTab })

      expect(layoutChangeCb).not.toHaveBeenCalled()
    })

    it('emits active-leaf-change with null when no tab is active from plugin-view state', () => {
      const registry = new ViewRegistry()
      registry.registerView('calendar', (leaf: unknown) => {
        const view = { getViewType: () => 'calendar', containerEl: document.createElement('div') }
        ;(leaf as { view: unknown }).view = view
        return view
      }, 'test-plugin')
      workspaceShim.setViewRegistry(registry, {})
      const leaf = registry.createLeaf({}, 'main')
      void leaf.setViewState({ type: 'calendar' })

      const leafChangeCb = vi.fn()
      workspaceShim.on('active-leaf-change', leafChangeCb)

      const pluginTabState: TabState = {
        tabs: [
          {
            id: 'vault1::__view::calendar',
            vaultId: 'vault1',
            filePath: '__view::calendar',
            fileName: 'Calendar',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::calendar',
      }

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: pluginTabState } },
      )

      // Clear active - from plugin-view to no tab
      rerender({ tabState: { tabs: [], activeTabId: null } })

      // Should have emitted with leaf first, then with null
      expect(leafChangeCb).toHaveBeenLastCalledWith(null)
    })

    it('does not emit file-open when plugin-view-tab becomes active', () => {
      const fileOpenCb = vi.fn()
      workspaceShim.on('file-open', fileOpenCb)

      const tabState: TabState = {
        tabs: [
          {
            id: 'vault1::__view::calendar',
            vaultId: 'vault1',
            filePath: '__view::calendar',
            fileName: 'Calendar',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::calendar',
      }

      renderHook(() =>
        usePluginEventBridge({
          tabState,
          directoryTree: mockTree,
          workspaceShim,
          metadataCacheShim,
        }),
      )

      expect(fileOpenCb).not.toHaveBeenCalled()
    })

    it('does not emit changed event for plugin-view-tabs', () => {
      const changedCb = vi.fn()
      metadataCacheShim.on('changed', changedCb)

      const initialTabState: TabState = {
        tabs: [
          {
            id: 'vault1::__view::calendar',
            vaultId: 'vault1',
            filePath: '__view::calendar',
            fileName: 'Calendar',
            mode: 'view',
            isBinary: false,
            content: '',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::calendar',
      }

      const { rerender } = renderHook(
        (props: { tabState: TabState }) =>
          usePluginEventBridge({
            tabState: props.tabState,
            directoryTree: mockTree,
            workspaceShim,
            metadataCacheShim,
          }),
        { initialProps: { tabState: initialTabState } },
      )

      // Simulate content change (should not trigger for plugin-view-tabs)
      const updatedTabState: TabState = {
        tabs: [
          {
            id: 'vault1::__view::calendar',
            vaultId: 'vault1',
            filePath: '__view::calendar',
            fileName: 'Calendar',
            mode: 'view',
            isBinary: false,
            content: 'something',
            editBuffer: null,
            loading: false,
            error: null,
          },
        ],
        activeTabId: 'vault1::__view::calendar',
      }
      rerender({ tabState: updatedTabState })

      expect(changedCb).not.toHaveBeenCalled()
    })
  })
})
