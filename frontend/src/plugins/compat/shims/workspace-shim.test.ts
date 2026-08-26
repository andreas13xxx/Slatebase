/* eslint-disable @typescript-eslint/no-unused-expressions */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceShim } from './workspace-shim';
import { clearApiGaps } from '../api-gap-registry';
import { ItemView, ViewRegistry, WorkspaceLeaf, WorkspaceSplit, WorkspaceRibbon } from '../view-registry';
import { resetLogDedup } from '../log';
import { registerFileExplorerRow, clearFileExplorerDomRegistry } from '../file-explorer-dom-registry';
import type { TFile } from '../types';

function createMockTFile(path: string): TFile {
  const name = path.split('/').pop() ?? path;
  const dotIndex = name.lastIndexOf('.');
  const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';
  return {
    path,
    name,
    basename,
    extension,
    stat: { mtime: Date.now(), ctime: Date.now(), size: 100 },
    parent: null,
  };
}

describe('WorkspaceShim', () => {
  let workspace: WorkspaceShim;

  beforeEach(() => {
    workspace = new WorkspaceShim();
    // The proxy's once-per-property warning is deduplicated by the shared
    // api-gap-registry rather than per shim instance, so tests must reset it to
    // stay independent of each other's non-emulated accesses.
    clearApiGaps();
    // Several WorkspaceShim warnings/notices are deduped session-wide via the
    // shared log module — reset so tests don't see each other's dedup state.
    resetLogDedup();
  });

  describe('leftRibbon / rightRibbon', () => {
    it('exposes hide/show/toggle as no-ops instead of leaving the property undefined', () => {
      expect(() => workspace.leftRibbon.hide()).not.toThrow();
      expect(() => workspace.leftRibbon.show()).not.toThrow();
      expect(() => workspace.leftRibbon.toggle()).not.toThrow();
      expect(() => workspace.rightRibbon.hide()).not.toThrow();
      expect(() => workspace.rightRibbon.show()).not.toThrow();
      expect(() => workspace.rightRibbon.toggle()).not.toThrow();
    });

    it('is a real instance of WorkspaceRibbon, not a plain object literal', () => {
      expect(workspace.leftRibbon).toBeInstanceOf(WorkspaceRibbon);
      expect(workspace.rightRibbon).toBeInstanceOf(WorkspaceRibbon);
    });
  });

  describe('rootSplit / leftSplit / rightSplit', () => {
    it('is a real instance of WorkspaceSplit, not a plain object literal', () => {
      expect(workspace.rootSplit).toBeInstanceOf(WorkspaceSplit);
      expect(workspace.leftSplit).toBeInstanceOf(WorkspaceSplit);
      expect(workspace.rightSplit).toBeInstanceOf(WorkspaceSplit);
    });

    it('still exposes the pre-existing stub shape (children/collapsed/toggle/collapse/expand)', () => {
      expect(workspace.rootSplit.children).toEqual([]);
      expect(workspace.leftSplit.collapsed).toBe(false);
      expect(() => workspace.leftSplit.toggle()).not.toThrow();
      expect(() => workspace.rightSplit.collapse()).not.toThrow();
      expect(() => workspace.rightSplit.expand()).not.toThrow();
    });

    it('getRoot() returns itself — these stubs have no parent chain and are each already their area\'s root', () => {
      expect(workspace.rootSplit.getRoot()).toBe(workspace.rootSplit);
      expect(workspace.leftSplit.getRoot()).toBe(workspace.leftSplit);
      expect(workspace.rightSplit.getRoot()).toBe(workspace.rightSplit);
    });
  });

  describe('iterateCodeMirrors()', () => {
    it('does not throw and never invokes the callback — no CM5 instances exist', () => {
      const callback = vi.fn();
      expect(() => workspace.iterateCodeMirrors(callback)).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('iterateLeaves() — legacy alias for iterateAllLeaves()', () => {
    it('invokes the callback for every leaf, ignoring the item parameter', async () => {
      const registry = new ViewRegistry();
      registry.registerView('test-view', (leaf) => new ItemView(leaf), 'test-plugin');
      workspace.setViewRegistry(registry, {});
      const leaf1 = workspace.getLeaf(true);
      await leaf1.setViewState({ type: 'test-view' });
      const leaf2 = workspace.getLeaf(true);
      await leaf2.setViewState({ type: 'test-view' });

      const seen: WorkspaceLeaf[] = [];
      workspace.iterateLeaves((leaf) => seen.push(leaf), undefined);

      expect(seen).toEqual(expect.arrayContaining([leaf1, leaf2]));
    });
  });

  describe('onLayoutChange()', () => {
    it('fires the layout-change event', () => {
      const callback = vi.fn();
      workspace.on('layout-change', callback);

      workspace.onLayoutChange();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('hoverLinkSources', () => {
    it('reflects sources declared via registerHoverLinkSource', () => {
      workspace.registerHoverLinkSource('my-plugin', { display: 'My Plugin' });

      expect(workspace.hoverLinkSources).toEqual({
        'my-plugin': { display: 'My Plugin' },
      });
    });

    it('drops a source once unregisterHoverLinkSource is called', () => {
      workspace.registerHoverLinkSource('my-plugin', { display: 'My Plugin' });
      workspace.unregisterHoverLinkSource('my-plugin');

      expect(workspace.hoverLinkSources).toEqual({});
    });
  });

  describe('protocolHandlers / protocolHandler', () => {
    it('exposes a writable Map and a writable field instead of leaving them undefined', () => {
      expect(workspace.protocolHandlers).toBeInstanceOf(Map);
      workspace.protocolHandlers.set('foo', () => 'bar');
      expect(workspace.protocolHandlers.get('foo')?.({})).toBe('bar');

      expect(workspace.protocolHandler).toBeNull();
      const handler = () => 'handled';
      workspace.protocolHandler = handler;
      expect(workspace.protocolHandler).toBe(handler);
    });
  });

  describe('getActiveFileView()', () => {
    it('returns null when no file is active', () => {
      expect(workspace.getActiveFileView()).toBeNull();
    });
  });

  describe('R6.1: getActiveFile() returns TFile when a file tab is active', () => {
    it('should return the active file after setActiveFile is called', () => {
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);
      expect(workspace.getActiveFile()).toBe(file);
    });
  });

  describe('R6.2: getActiveFile() returns null when no file tab is active', () => {
    it('should return null initially', () => {
      expect(workspace.getActiveFile()).toBeNull();
    });

    it('should return null after setActiveFile(null)', () => {
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);
      workspace.setActiveFile(null);
      expect(workspace.getActiveFile()).toBeNull();
    });
  });

  describe('R6.3: Emits file-open event when user opens a different file', () => {
    it('should emit file-open when a non-null file is set', () => {
      const callback = vi.fn();
      workspace.on('file-open', callback);

      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(file);
    });

    it('should not emit file-open when setting the same file again', () => {
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      const callback = vi.fn();
      workspace.on('file-open', callback);
      workspace.setActiveFile(file);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit file-open when setActiveFile(null) is called', () => {
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      const callback = vi.fn();
      workspace.on('file-open', callback);
      workspace.setActiveFile(null);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('R6.4: Emits active-leaf-change when active tab changes', () => {
    beforeEach(() => {
      // Provide a ViewRegistry so that setActiveFile can create a leaf
      const registry = new ViewRegistry();
      const mockApp = {};
      workspace.setViewRegistry(registry, mockApp);
    });

    it('should emit active-leaf-change with a leaf when a file is opened', () => {
      const callback = vi.fn();
      workspace.on('active-leaf-change', callback);

      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      expect(callback).toHaveBeenCalledTimes(1);
      // active-leaf-change is emitted with the leaf object (not the TFile directly)
      const leaf = callback.mock.calls[0]![0];
      expect(leaf).not.toBeNull();
      expect(leaf.view.file).toBe(file);
    });

    it('should emit active-leaf-change with an "empty" leaf (not null) when no file tab is active', () => {
      // Real Obsidian's active leaf is (almost) never null — plugins like
      // Excalidraw call `leaf.view?.getViewType()` on the leaf itself without
      // null-checking the leaf, so emitting null here crashes them.
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      const callback = vi.fn();
      workspace.on('active-leaf-change', callback);
      workspace.setActiveFile(null);

      expect(callback).toHaveBeenCalledTimes(1);
      const leaf = callback.mock.calls[0]![0];
      expect(leaf).not.toBeNull();
      expect(leaf.view.getViewType()).toBe('empty');
    });

    it('should emit active-leaf-change with null when no leaf has ever been created', () => {
      const callback = vi.fn();
      workspace.on('active-leaf-change', callback);
      workspace.setActiveFile(null);

      // setActiveFile(null) with no prior file open is a no-op (previousFile
      // was already null), so nothing should fire at all.
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit active-leaf-change when same file is set again', () => {
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      const callback = vi.fn();
      workspace.on('active-leaf-change', callback);
      workspace.setActiveFile(file);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('R6.5: on() registers callback and returns EventRef', () => {
    it('should return an EventRef with id, event, and callback', () => {
      const callback = vi.fn();
      const ref = workspace.on('file-open', callback);

      expect(ref).toHaveProperty('id');
      expect(ref.event).toBe('file-open');
      expect(ref.callback).toBe(callback);
    });

    it('should allow multiple off() calls without throwing', () => {
      const callback = vi.fn();
      workspace.on('file-open', callback);

      // Multiple off() calls should not throw
      expect(() => workspace.off('file-open', callback)).not.toThrow();
      expect(() => workspace.off('file-open', callback)).not.toThrow();
      expect(() => workspace.off('file-open', callback)).not.toThrow();
    });

    it('should not call removed callback on trigger', () => {
      const callback = vi.fn();
      workspace.on('file-open', callback);
      workspace.off('file-open', callback);

      workspace.trigger('file-open', createMockTFile('test.md'));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('R6.7: Non-emulated methods return no-op with console.warn', () => {
    it('should return a no-op function for non-emulated methods via Proxy', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      // Access a non-emulated method (one that is NOT in emulatedProperties)
      const result = (proxied as Record<string, unknown>)['openMarkdownView'];
      expect(typeof result).toBe('function');
      expect((result as () => unknown)()).toBeUndefined();

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('openMarkdownView');
      expect(warnSpy.mock.calls[0]?.[0]).toContain('non-emulated');

      warnSpy.mockRestore();
    });

    it('should only log warning once per property name', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      // Access the same non-emulated method multiple times
      (proxied as Record<string, unknown>)['openPopout'];
      (proxied as Record<string, unknown>)['openPopout'];
      (proxied as Record<string, unknown>)['openPopout'];

      // Should have logged only once
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('should log separate warnings for different non-emulated properties', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      (proxied as Record<string, unknown>)['openPopout'];
      (proxied as Record<string, unknown>)['moveLeafToPopout'];
      (proxied as Record<string, unknown>)['duplicateLeaf'];

      expect(warnSpy).toHaveBeenCalledTimes(3);

      warnSpy.mockRestore();
    });

    it('should not warn for emulated methods', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      // Access emulated methods (including new leaf management ones)
      proxied.getActiveFile();
      proxied.on('file-open', vi.fn());
      proxied.trigger('file-open');
      proxied.getActiveLeaf();

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should allow emulated methods to work correctly through proxy', () => {
      const proxied = WorkspaceShim.createProxied();
      const file = createMockTFile('notes/test.md');

      proxied.setActiveFile(file);
      expect(proxied.getActiveFile()).toBe(file);
    });

    it('should correctly emit events through the proxy', () => {
      const proxied = WorkspaceShim.createProxied();
      const callback = vi.fn();

      proxied.on('file-open', callback);
      const file = createMockTFile('notes/test.md');
      proxied.setActiveFile(file);

      expect(callback).toHaveBeenCalledWith(file);
    });

    // Regression: the `activeEditor` getter reads `this.editorShim`, a private
    // field never listed in emulatedProperties. If the Proxy's `get` trap
    // invokes that getter with the Proxy itself as receiver, `this.editorShim`
    // re-enters the trap and resolves through the generic gap fallback instead
    // of the real field, silently swapping the real EditorShim for a callable
    // no-op. Any plugin calling `workspace.activeEditor.editor.hasFocus()`
    // (e.g. "Editing Toolbar") then throws "hasFocus is not a function".
    it('activeEditor.editor accessed through the proxy is a real EditorShim, not a gap no-op', () => {
      const proxied = WorkspaceShim.createProxied();
      const file = createMockTFile('notes/test.md');
      proxied.setActiveFile(file);

      const editor = proxied.activeEditor?.editor;
      expect(typeof editor).toBe('object');
      expect(typeof (editor as { hasFocus?: unknown })?.hasFocus).toBe('function');
      expect(() => (editor as { hasFocus: () => boolean }).hasFocus()).not.toThrow();
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all registered listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      workspace.on('file-open', callback1);
      workspace.on('active-leaf-change', callback2);

      workspace.removeAllListeners();

      workspace.trigger('file-open', createMockTFile('test.md'));
      workspace.trigger('active-leaf-change', null);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('Leaf Management Methods', () => {
    let registry: ViewRegistry;

    beforeEach(() => {
      registry = new ViewRegistry();
      workspace.setViewRegistry(registry, {});
    });

    describe('getLeaf()', () => {
      it('should create a new leaf with location main when newLeaf is true', () => {
        const leaf = workspace.getLeaf(true);
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
      });

      it('returns a real WorkspaceLeaf instance, so plugin `instanceof WorkspaceLeaf` checks hold', () => {
        const leaf = workspace.getLeaf(true);
        expect(leaf).toBeInstanceOf(WorkspaceLeaf);
      });

      it('should return an existing leaf with null view when newLeaf is falsy', () => {
        // Create a leaf with no view
        const firstLeaf = workspace.getLeaf(true);
        expect(firstLeaf.view).toBeNull();

        // Now getLeaf() without true should return the existing empty leaf
        const secondLeaf = workspace.getLeaf();
        expect(secondLeaf).toBe(firstLeaf);
      });

      it('should create a new leaf if no empty leaf exists', () => {
        const leaf = workspace.getLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
      });

      it('should create a new leaf when newLeaf is false but no empty leaf exists', () => {
        const leaf = workspace.getLeaf(false);
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
      });

      it('applies the owning plugin ID to a custom view root for scoped styles', async () => {
        registry.registerView('test-plugin-view', (leaf) => new ItemView(leaf), 'test-plugin');
        const leaf = workspace.getLeaf(true);

        await leaf.setViewState({ type: 'test-plugin-view' });

        expect(leaf.view?.containerEl.dataset.pluginId).toBe('test-plugin');
      });

      it('opens a tab for a TextFileView-based view activated via setViewState (e.g. a new Kanban board)', async () => {
        // Duck-typed TextFileView: has getViewData/setViewData/requestSave.
        class FakeTextFileView extends ItemView {
          getViewData(): string { return ''; }
          setViewData(): void { /* no-op */ }
          requestSave(): void { /* no-op */ }
          async setState(): Promise<void> { /* no-op, skip real file loading */ }
        }
        registry.registerView('kanban', (leaf) => new FakeTextFileView(leaf), 'kanban-plugin');

        const openFileDirectly = vi.fn();
        workspace.setViewRegistry(registry, { workspace: { openFileDirectly } });

        const leaf = workspace.getLeaf(true);
        await leaf.setViewState({ type: 'kanban', state: { file: 'boards/new-board.md' } });

        expect(openFileDirectly).toHaveBeenCalledWith('boards/new-board.md');
      });
    });

    describe('notifyFileRenamed()', () => {
      it("updates a matching view's file and calls onRename with the renamed file", async () => {
        const onRename = vi.fn();
        class FakeFileView extends ItemView {
          file: { path: string } | null = null
          onRename = onRename
        }
        registry.registerView('fake-file-view', (leaf) => new FakeFileView(leaf), 'fake-plugin');

        const leaf = workspace.getLeaf(true);
        await leaf.setViewState({ type: 'fake-file-view' });
        const view = leaf.view as unknown as FakeFileView;
        view.file = { path: 'notes/old.md' };

        const renamedFile = { path: 'notes/new.md' };
        registry.notifyFileRenamed(renamedFile, 'notes/old.md');

        expect(view.file).toBe(renamedFile);
        expect(onRename).toHaveBeenCalledWith(renamedFile);
      });

      it('leaves non-matching views untouched', async () => {
        const onRename = vi.fn();
        class FakeFileView extends ItemView {
          file: { path: string } | null = { path: 'notes/unrelated.md' }
          onRename = onRename
        }
        registry.registerView('fake-file-view', (leaf) => new FakeFileView(leaf), 'fake-plugin');

        const leaf = workspace.getLeaf(true);
        await leaf.setViewState({ type: 'fake-file-view' });
        const view = leaf.view as unknown as FakeFileView;
        const originalFile = view.file;

        registry.notifyFileRenamed({ path: 'notes/new.md' }, 'notes/old.md');

        expect(view.file).toBe(originalFile);
        expect(onRename).not.toHaveBeenCalled();
      });

      it('updates the file reference even when the view has no onRename override', async () => {
        class FakeFileView extends ItemView {
          file: { path: string } | null = { path: 'notes/old.md' }
        }
        registry.registerView('fake-file-view', (leaf) => new FakeFileView(leaf), 'fake-plugin');

        const leaf = workspace.getLeaf(true);
        await leaf.setViewState({ type: 'fake-file-view' });
        const view = leaf.view as unknown as FakeFileView;

        const renamedFile = { path: 'notes/new.md' };
        expect(() => registry.notifyFileRenamed(renamedFile, 'notes/old.md')).not.toThrow();

        expect(view.file).toBe(renamedFile);
      });

      it('does not let one view onRename throwing stop other leaves from being notified', async () => {
        const throwingOnRename = vi.fn(() => { throw new Error('boom'); });
        const okOnRename = vi.fn();
        class ThrowingFileView extends ItemView {
          file: { path: string } | null = { path: 'notes/shared.md' }
          onRename = throwingOnRename
        }
        class OkFileView extends ItemView {
          file: { path: string } | null = { path: 'notes/shared.md' }
          onRename = okOnRename
        }
        registry.registerView('throwing-view', (leaf) => new ThrowingFileView(leaf), 'plugin-a');
        registry.registerView('ok-view', (leaf) => new OkFileView(leaf), 'plugin-b');

        const leafA = registry.createLeaf({}, 'main');
        await leafA.setViewState({ type: 'throwing-view' });
        const leafB = registry.createLeaf({}, 'main');
        await leafB.setViewState({ type: 'ok-view' });

        const renamedFile = { path: 'notes/shared-renamed.md' };
        expect(() => registry.notifyFileRenamed(renamedFile, 'notes/shared.md')).not.toThrow();

        expect(throwingOnRename).toHaveBeenCalled();
        expect(okOnRename).toHaveBeenCalledWith(renamedFile);
      });
    });

    describe('ItemView.containerEl — real Obsidian class names and data-type', () => {
      // Regression: obsidian-day-planner's Timeline view lays itself out
      // entirely via `[data-type="planner-timeline"] .view-content { display:
      // grid; ... }` in its own stylesheet. containerEl used to get class
      // "view-content" (real Obsidian's name for the *inner* contentEl, not
      // the outer containerEl) and never got a data-type attribute at all —
      // so that selector never matched anything, and the view fell back to
      // plain block stacking (header at the bottom, hour labels spaced out
      // with no grid to constrain them).
      class FakeTimelineView extends ItemView {
        getViewType(): string { return 'planner-timeline'; }
      }

      it('containerEl carries the real "workspace-leaf-content" class', async () => {
        registry.registerView('planner-timeline', (leaf) => new FakeTimelineView(leaf), 'day-planner');
        const leaf = registry.createLeaf({}, 'main');
        await leaf.setViewState({ type: 'planner-timeline' });

        expect(leaf.view!.containerEl.classList.contains('workspace-leaf-content')).toBe(true);
      });

      it('contentEl (containerEl.children[1]) carries the real "view-content" class', async () => {
        registry.registerView('planner-timeline', (leaf) => new FakeTimelineView(leaf), 'day-planner');
        const leaf = registry.createLeaf({}, 'main');
        await leaf.setViewState({ type: 'planner-timeline' });

        const contentEl = leaf.view!.containerEl.children[1] as HTMLElement;
        expect(contentEl.classList.contains('view-content')).toBe(true);
      });

      it('containerEl gets data-type set to the view type, for plugin stylesheets scoped to it', async () => {
        registry.registerView('planner-timeline', (leaf) => new FakeTimelineView(leaf), 'day-planner');
        const leaf = registry.createLeaf({}, 'main');
        await leaf.setViewState({ type: 'planner-timeline' });

        expect(leaf.view!.containerEl.dataset.type).toBe('planner-timeline');
      });

      it('open() also sets data-type, for views attached via leaf.open() instead of setViewState()', async () => {
        const leaf = registry.createLeaf({}, 'main');
        const view = new FakeTimelineView(leaf);

        await leaf.open(view);

        expect(view.containerEl.dataset.type).toBe('planner-timeline');
      });
    });

    describe('getRightLeaf()', () => {
      it('should create a leaf with location right-sidebar', () => {
        const leaf = workspace.getRightLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('right-sidebar');
      });
    });

    describe('getRoot()', () => {
      // Production wires `app.workspace` back to the same WorkspaceShim instance
      // (see plugin-context.ts's `sharedApp`); the outer beforeEach's `{}` mock
      // doesn't, so getRoot() needs a leaf whose app actually has that link.
      beforeEach(() => {
        workspace.setViewRegistry(registry, { workspace });
      });

      it('returns workspace.rootSplit for a main-area leaf', () => {
        const leaf = workspace.getLeaf(true);
        expect(leaf.getRoot()).toBe(workspace.rootSplit);
      });

      it('returns workspace.rightSplit for a sidebar leaf', () => {
        const leaf = workspace.getRightLeaf();
        expect(leaf.getRoot()).toBe(workspace.rightSplit);
      });

      it('returns workspace.leftSplit for a left-sidebar leaf', () => {
        const leaf = workspace.getLeftLeaf();
        expect(leaf.getRoot()).toBe(workspace.leftSplit);
      });

      it('supports calling .getRoot() again on the returned split, like day-planner\'s isLeafInSidebar does', () => {
        // Real Obsidian's WorkspaceParent.getRoot() walks up to the root via
        // `this.parent ? this.parent.getRoot() : this`. Plugins that mirror
        // that pattern (day-planner's isLeafInSidebar) call `.getRoot()` a
        // second time on the split leaf.getRoot() returned — this used to
        // throw "t.getRoot is not a function" since WorkspaceSplit had no
        // getRoot() of its own.
        const rightLeaf = workspace.getRightLeaf();
        expect(() => rightLeaf.getRoot().getRoot()).not.toThrow();
        expect(rightLeaf.getRoot().getRoot()).toBe(workspace.rightSplit);
      });
    });

    describe('getLeftLeaf()', () => {
      it('should create a leaf with location left-sidebar', () => {
        const leaf = workspace.getLeftLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('left-sidebar');
      });
    });

    describe('ensureSideLeaf()', () => {
      // getLeavesOfType() matches on the VIEW's own getViewType(), not just the
      // registration key, so the fake view here must return it — same as any
      // real plugin view would.
      class FakeSideView extends ItemView {
        getViewType(): string { return 'my-view'; }
      }

      it('creates a new sidebar leaf and activates the requested view type', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');

        const leaf = await workspace.ensureSideLeaf('my-view', 'right');

        expect(leaf.location).toBe('right-sidebar');
        expect(leaf.view?.getViewType()).toBe('my-view');
        expect(workspace.getActiveLeaf()).toBe(leaf);
      });

      it('reuses an existing leaf of the same view type on the same side', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');

        const first = await workspace.ensureSideLeaf('my-view', 'right');
        const second = await workspace.ensureSideLeaf('my-view', 'right');

        expect(second).toBe(first);
        expect(workspace.getLeavesOfType('my-view')).toHaveLength(1);
      });

      it('creates a distinct leaf per side instead of reusing across sides', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');

        const right = await workspace.ensureSideLeaf('my-view', 'right');
        const left = await workspace.ensureSideLeaf('my-view', 'left');

        expect(left).not.toBe(right);
        expect(right.location).toBe('right-sidebar');
        expect(left.location).toBe('left-sidebar');
        expect(workspace.getLeavesOfType('my-view')).toHaveLength(2);
      });

      it('does not activate the leaf when reveal is false', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');

        await workspace.ensureSideLeaf('my-view', 'right', { reveal: false });

        expect(workspace.getActiveLeaf()).toBeNull();
      });
    });

    describe('moveLeafToSide()', () => {
      // getRoot() needs app.workspace linked back to the real WorkspaceShim
      // instance to resolve leftSplit/rightSplit — see the getRoot() describe
      // block's beforeEach above for why the outer `{}` mock isn't enough.
      beforeEach(() => {
        workspace.setViewRegistry(registry, { workspace });
      });

      class FakeSideView extends ItemView {
        getViewType(): string { return 'my-view'; }
      }

      it('moves an active leaf to the other side, updating location and getRoot()', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');
        const leaf = await workspace.ensureSideLeaf('my-view', 'right');

        registry.moveLeafToSide(leaf, 'left');

        expect(leaf.location).toBe('left-sidebar');
        expect(leaf.getRoot()).toBe(workspace.leftSplit);
      });

      it('fires the source side deactivate callback and the target side activate callback with the same view and leaf', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');
        const leaf = await workspace.ensureSideLeaf('my-view', 'right');
        const view = leaf.view;

        const onSidebarDeactivated = vi.fn();
        const onLeftSidebarActivated = vi.fn();
        registry.setOnSidebarViewDeactivated(onSidebarDeactivated);
        registry.setOnLeftSidebarViewActivated(onLeftSidebarActivated);

        registry.moveLeafToSide(leaf, 'left');

        expect(onSidebarDeactivated).toHaveBeenCalledWith('my-view', view);
        expect(onLeftSidebarActivated).toHaveBeenCalledWith('my-view', view, leaf);
      });

      it('is a no-op when the leaf is already on the target side', async () => {
        registry.registerView('my-view', (leaf) => new FakeSideView(leaf), 'my-plugin');
        const leaf = await workspace.ensureSideLeaf('my-view', 'right');

        const onSidebarDeactivated = vi.fn();
        registry.setOnSidebarViewDeactivated(onSidebarDeactivated);

        registry.moveLeafToSide(leaf, 'right');

        expect(leaf.location).toBe('right-sidebar');
        expect(onSidebarDeactivated).not.toHaveBeenCalled();
      });

      it('is a no-op for a main-area leaf', () => {
        const leaf = workspace.getLeaf(true);

        expect(() => registry.moveLeafToSide(leaf, 'left')).not.toThrow();
        expect(leaf.location).toBe('main');
      });

      it('is a no-op for an unknown/foreign leaf', () => {
        const foreignRegistry = new ViewRegistry();
        const foreignWorkspace = new WorkspaceShim();
        foreignWorkspace.setViewRegistry(foreignRegistry, {});
        const foreignLeaf = foreignRegistry.createLeaf({}, 'right-sidebar');

        expect(() => registry.moveLeafToSide(foreignLeaf, 'left')).not.toThrow();
        expect(foreignLeaf.location).toBe('right-sidebar');
      });
    });

    describe("getLeavesOfType('file-explorer')", () => {
      afterEach(() => {
        clearFileExplorerDomRegistry();
      });

      it('returns a single synthetic leaf whose view reports the real Obsidian view type', () => {
        const leaves = workspace.getLeavesOfType('file-explorer');
        expect(leaves).toHaveLength(1);
        expect(leaves[0].view?.getViewType()).toBe('file-explorer');
      });

      it('returns the same leaf on repeated access (singleton, not re-created per call)', () => {
        const first = workspace.getLeavesOfType('file-explorer')[0];
        const second = workspace.getLeavesOfType('file-explorer')[0];
        expect(second).toBe(first);
      });

      it('exposes fileItems backed by the live file-explorer DOM registry', () => {
        const el = document.createElement('button');
        registerFileExplorerRow('notes/hello.md', 'hello.md', 'file', el);

        const leaf = workspace.getLeavesOfType('file-explorer')[0];
        const fileItems = (leaf.view as unknown as { fileItems: Record<string, unknown> }).fileItems;
        expect(fileItems['notes/hello.md']).toEqual(expect.objectContaining({ titleEl: el }));
        expect(fileItems['does/not/exist.md']).toBeUndefined();
      });

      it('does not register the leaf in ViewRegistry — safe from ViewRegistry.clear() removing live DOM', async () => {
        // ViewRegistry.clear() (invoked on every vault switch) calls
        // view.containerEl.remove() on every tracked leaf. The file-explorer
        // leaf must stay untracked, or the first vault switch after a plugin
        // touches it would tear the real sidebar element out of the page.
        workspace.getLeavesOfType('file-explorer');
        expect(registry.getAllLeaves()).toHaveLength(0);
        await expect(registry.clear()).resolves.not.toThrow();
      });

      it('falls back to a safe no-op for non-emulated view properties instead of crashing', () => {
        const leaf = workspace.getLeavesOfType('file-explorer')[0];
        const view = leaf.view as unknown as Record<string, unknown>;
        expect(() => (view.requestSort as () => void)()).not.toThrow();
        expect(typeof view.sortOrder).toBe('function');
      });
    });

    describe('WorkspaceLeaf.isDeferred / loadIfDeferred()', () => {
      it('is never deferred, since setViewState() always loads the view eagerly', () => {
        const leaf = workspace.getLeaf(true);
        expect(leaf.isDeferred).toBe(false);
      });

      it('loadIfDeferred() resolves immediately without error', async () => {
        const leaf = workspace.getLeaf(true);
        await expect(leaf.loadIfDeferred()).resolves.toBeUndefined();
      });
    });

    describe('getActiveLeaf()', () => {
      it('should return null initially', () => {
        expect(workspace.getActiveLeaf()).toBeNull();
      });

      it('should return the active leaf after setActiveLeaf is called', () => {
        const leaf = workspace.getLeaf(true);
        workspace.setActiveLeaf(leaf);
        expect(workspace.getActiveLeaf()).toBe(leaf);
      });
    });

    describe('setActiveLeaf()', () => {
      it('should set the active leaf and emit active-leaf-change', () => {
        const callback = vi.fn();
        workspace.on('active-leaf-change', callback);

        const leaf = workspace.getLeaf(true);
        workspace.setActiveLeaf(leaf);

        expect(workspace.getActiveLeaf()).toBe(leaf);
        expect(callback).toHaveBeenCalledWith(leaf);
      });

      it('should warn and not change state for unknown leaf', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const callback = vi.fn();
        workspace.on('active-leaf-change', callback);

        // Create a leaf from a different registry (unknown to workspace)
        const otherRegistry = new ViewRegistry();
        const unknownLeaf = otherRegistry.createLeaf({}, 'main');

        workspace.setActiveLeaf(unknownLeaf);

        expect(workspace.getActiveLeaf()).toBeNull();
        expect(callback).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
      });
    });

    describe('getMostRecentLeaf()', () => {
      // Regression: real plugins with their own sidebar toolbar (Advanced
      // Tables' table-controls panel) call this — not getActiveLeaf() — to
      // find the editor to act on, specifically because it should keep
      // pointing at the main-area editor even while the user's click that
      // triggered them landed inside the sidebar panel itself. Sharing a
      // single "active leaf" field for both broke that: revealing the
      // sidebar leaf silently redirected getMostRecentLeaf() too, so
      // `leaf.view instanceof MarkdownView` failed for a plugin's own
      // sidebar button clicks.
      it('keeps pointing at the main file leaf after a sidebar leaf is revealed', async () => {
        const file = createMockTFile('notes/hello.md');
        workspace.setActiveFile(file);
        const fileLeaf = workspace.getMostRecentLeaf();
        expect(fileLeaf?.location).toBe('main');

        registry.registerView('sidebar-tool', (leaf) => new ItemView(leaf), 'some-plugin');
        const sidebarLeaf = workspace.getRightLeaf();
        await sidebarLeaf.setViewState({ type: 'sidebar-tool', active: true });
        workspace.revealLeaf(sidebarLeaf);

        expect(workspace.getActiveLeaf()).toBe(sidebarLeaf);
        expect(workspace.getMostRecentLeaf()).toBe(fileLeaf);
      });

      it('returns a leaf whose view is a real MarkdownView instance for the active file', async () => {
        const { installObsidianGlobals } = await import('../install-globals');
        installObsidianGlobals();

        const file = createMockTFile('notes/hello.md');
        workspace.setActiveFile(file);

        registry.registerView('sidebar-tool', (leaf) => new ItemView(leaf), 'some-plugin');
        const sidebarLeaf = workspace.getRightLeaf();
        await sidebarLeaf.setViewState({ type: 'sidebar-tool', active: true });
        workspace.revealLeaf(sidebarLeaf);

        const MarkdownViewClass = (window as unknown as { obsidian: Record<string, unknown> }).obsidian['MarkdownView'] as new (...args: unknown[]) => unknown;
        const mostRecent = workspace.getMostRecentLeaf();
        expect(mostRecent?.view).toBeInstanceOf(MarkdownViewClass);
      });

      // Regression: "Editing Toolbar" builds its floating selection toolbar off
      // `containerEl.querySelector('.markdown-source-view')` during onload()/
      // onLayoutReady(), before the CM6 editor has mounted. The pre-mount
      // fallback containerEl previously had no such descendant, so that lookup
      // returned null, the plugin silently skipped creating its toolbar
      // element, and crashed later ("t.containerEl is undefined") the first
      // time the user selected text and its selectionchange handler ran.
      it('getActiveViewOfType(MarkdownView).containerEl exposes a .markdown-source-view descendant even before the CM6 editor mounts', async () => {
        const { installObsidianGlobals } = await import('../install-globals');
        installObsidianGlobals();

        const file = createMockTFile('notes/hello.md');
        workspace.setActiveFile(file);

        const MarkdownViewClass = (window as unknown as { obsidian: Record<string, unknown> }).obsidian['MarkdownView'] as new (...args: unknown[]) => { containerEl: HTMLElement };
        const view = workspace.getActiveViewOfType(MarkdownViewClass);
        expect(view).not.toBeNull();
        expect(view!.containerEl.querySelector('.markdown-source-view')).not.toBeNull();
      });

      it('activeLeaf.view.containerEl exposes a .markdown-source-view descendant even before the CM6 editor mounts', () => {
        const file = createMockTFile('notes/hello.md');
        workspace.setActiveFile(file);

        const containerEl = workspace.getActiveLeaf()!.view.containerEl;
        expect(containerEl.querySelector('.markdown-source-view')).not.toBeNull();
        // Reading it again must return the same element, not a fresh detached
        // div each time (plugins may query once and reuse the reference).
        expect(workspace.getActiveLeaf()!.view.containerEl).toBe(containerEl);
      });

      it('tracks a main leaf activated directly via setActiveLeaf(), not just setActiveFile()', () => {
        const leaf = workspace.getLeaf(true);
        workspace.setActiveLeaf(leaf);
        expect(workspace.getMostRecentLeaf()).toBe(leaf);
      });
    });

    describe('getUnpinnedLeaf()', () => {
      it('should create a new leaf with location main', () => {
        const leaf = workspace.getUnpinnedLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
      });
    });

    describe('createLeafBySplit()', () => {
      it('should create a new leaf and log a debug notice about no split support', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const existingLeaf = workspace.getLeaf(true);
        const newLeaf = workspace.createLeafBySplit(existingLeaf);

        expect(newLeaf).toBeDefined();
        expect(newLeaf.location).toBe('main');
        expect(newLeaf).not.toBe(existingLeaf);
        expect(debugSpy).toHaveBeenCalledWith(
          '[WorkspaceShim] createLeafBySplit: Slatebase does not support split panes — created new tab instead.'
        );

        debugSpy.mockRestore();
      });
    });

    describe('splitActiveLeaf()', () => {
      it('should create a new leaf and log a debug notice about no split support', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const leaf = workspace.splitActiveLeaf();

        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
        expect(debugSpy).toHaveBeenCalledWith(
          '[WorkspaceShim] splitActiveLeaf: Slatebase does not support split panes — created new tab instead.'
        );

        debugSpy.mockRestore();
      });
    });

    describe('setActiveLeafInternal()', () => {
      it('should set the active leaf without emitting events', () => {
        const callback = vi.fn();
        workspace.on('active-leaf-change', callback);

        const leaf = workspace.getLeaf(true);
        workspace.setActiveLeafInternal(leaf);

        expect(workspace.getActiveLeaf()).toBe(leaf);
        expect(callback).not.toHaveBeenCalled();
      });

      it('should accept null to clear the active leaf', () => {
        const leaf = workspace.getLeaf(true);
        workspace.setActiveLeafInternal(leaf);
        workspace.setActiveLeafInternal(null);

        expect(workspace.getActiveLeaf()).toBeNull();
      });
    });

    describe('registerView() with pluginId', () => {
      it('should pass pluginId to the view registry', () => {
        const creator = vi.fn();
        workspace.registerView('my-view', creator, 'my-plugin');

        expect(registry.hasViewType('my-view')).toBe(true);
      });

      it('should default pluginId to unknown when not provided', () => {
        const creator = vi.fn();
        workspace.registerView('my-view', creator);

        expect(registry.hasViewType('my-view')).toBe(true);
      });
    });
  });
});
