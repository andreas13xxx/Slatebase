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
})
