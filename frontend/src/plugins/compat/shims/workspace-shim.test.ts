/* eslint-disable @typescript-eslint/no-unused-expressions */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceShim } from './workspace-shim';
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
    it('should emit active-leaf-change with TFile when a file is opened', () => {
      const callback = vi.fn();
      workspace.on('active-leaf-change', callback);

      const file = createMockTFile('notes/hello.md');
      workspace.setActiveFile(file);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(file);
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

      // Access a non-emulated method
      const result = (proxied as Record<string, unknown>)['createLeafBySplit'];
      expect(typeof result).toBe('function');
      expect((result as () => unknown)()).toBeUndefined();

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('createLeafBySplit');
      expect(warnSpy.mock.calls[0]?.[0]).toContain('non-emulated');

      warnSpy.mockRestore();
    });

    it('should only log warning once per property name per instance', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      // Access the same non-emulated method multiple times
      (proxied as Record<string, unknown>)['iterateAllLeaves'];
      (proxied as Record<string, unknown>)['iterateAllLeaves'];
      (proxied as Record<string, unknown>)['iterateAllLeaves'];

      // Should have logged only once
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('should log separate warnings for different non-emulated properties', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      (proxied as Record<string, unknown>)['createLeafBySplit'];
      (proxied as Record<string, unknown>)['iterateAllLeaves'];
      (proxied as Record<string, unknown>)['setActiveLeaf'];

      expect(warnSpy).toHaveBeenCalledTimes(3);

      warnSpy.mockRestore();
    });

    it('should not warn for emulated methods', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const proxied = WorkspaceShim.createProxied();

      // Access emulated methods
      proxied.getActiveFile();
      proxied.on('file-open', vi.fn());
      proxied.trigger('file-open');

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
});
