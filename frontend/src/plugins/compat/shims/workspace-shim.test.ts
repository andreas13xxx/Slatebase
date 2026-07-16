/* eslint-disable @typescript-eslint/no-unused-expressions */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceShim } from './workspace-shim';
import { ViewRegistry } from '../view-registry';
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

    it('should emit active-leaf-change with null when no file tab is active', () => {
      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      const callback = vi.fn();
      workspace.on('active-leaf-change', callback);
      workspace.setActiveFile(null);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(null);
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

    it('should only log warning once per property name per instance', () => {
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
    });

    describe('getRightLeaf()', () => {
      it('should create a leaf with location right-sidebar', () => {
        const leaf = workspace.getRightLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('right-sidebar');
      });
    });

    describe('getLeftLeaf()', () => {
      it('should create a leaf with location right-sidebar (Slatebase maps both to right)', () => {
        const leaf = workspace.getLeftLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('right-sidebar');
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

    describe('getUnpinnedLeaf()', () => {
      it('should create a new leaf with location main', () => {
        const leaf = workspace.getUnpinnedLeaf();
        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
      });
    });

    describe('createLeafBySplit()', () => {
      it('should create a new leaf and log info about no split support', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        const existingLeaf = workspace.getLeaf(true);
        const newLeaf = workspace.createLeafBySplit(existingLeaf);

        expect(newLeaf).toBeDefined();
        expect(newLeaf.location).toBe('main');
        expect(newLeaf).not.toBe(existingLeaf);
        expect(infoSpy).toHaveBeenCalledWith(
          '[WorkspaceShim] createLeafBySplit: Slatebase does not support split panes — created new tab instead.'
        );

        infoSpy.mockRestore();
      });
    });

    describe('splitActiveLeaf()', () => {
      it('should create a new leaf and log info about no split support', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        const leaf = workspace.splitActiveLeaf();

        expect(leaf).toBeDefined();
        expect(leaf.location).toBe('main');
        expect(infoSpy).toHaveBeenCalledWith(
          '[WorkspaceShim] splitActiveLeaf: Slatebase does not support split panes — created new tab instead.'
        );

        infoSpy.mockRestore();
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
