import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from './command-registry';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe('addCommand', () => {
    it('stores command with namespaced ID <pluginId>:<commandId>', () => {
      const callback = vi.fn();
      registry.addCommand('my-plugin', { id: 'do-thing', name: 'Do Thing', callback });

      const commands = registry.getCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0]!.id).toBe('my-plugin:do-thing');
      expect(commands[0]!.name).toBe('Do Thing');
      expect(commands[0]!.pluginId).toBe('my-plugin');
    });

    it('registers hotkeys when provided', () => {
      const callback = vi.fn();
      registry.addCommand('plugin-a', {
        id: 'cmd1',
        name: 'Command One',
        callback,
        hotkeys: [{ modifiers: ['Ctrl'], key: 'K' }],
      });

      const hotkeys = registry.getRegisteredHotkeys();
      expect(hotkeys.get('ctrl+k')).toBe('plugin-a:cmd1');
    });

    it('supports multiple commands from the same plugin', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd 1', callback: vi.fn() });
      registry.addCommand('plugin-a', { id: 'cmd2', name: 'Cmd 2', callback: vi.fn() });

      const commands = registry.getCommands();
      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.id)).toContain('plugin-a:cmd1');
      expect(commands.map(c => c.id)).toContain('plugin-a:cmd2');
    });

    it('allows same commandId from different plugins (namespacing ensures uniqueness)', () => {
      registry.addCommand('plugin-a', { id: 'save', name: 'Save A', callback: vi.fn() });
      registry.addCommand('plugin-b', { id: 'save', name: 'Save B', callback: vi.fn() });

      const commands = registry.getCommands();
      expect(commands).toHaveLength(2);
      expect(commands.map(c => c.id)).toContain('plugin-a:save');
      expect(commands.map(c => c.id)).toContain('plugin-b:save');
    });
  });

  describe('removeCommand', () => {
    it('removes a command by its namespaced ID', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd 1', callback: vi.fn() });
      registry.removeCommand('plugin-a:cmd1');

      expect(registry.getCommands()).toHaveLength(0);
    });

    it('removes associated hotkeys when a command is removed', () => {
      registry.addCommand('plugin-a', {
        id: 'cmd1',
        name: 'Cmd 1',
        callback: vi.fn(),
        hotkeys: [{ modifiers: ['Ctrl'], key: 'K' }],
      });

      registry.removeCommand('plugin-a:cmd1');

      const hotkeys = registry.getRegisteredHotkeys();
      expect(hotkeys.size).toBe(0);
    });

    it('does nothing for a non-existent command ID', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd 1', callback: vi.fn() });
      registry.removeCommand('non-existent:cmd');

      expect(registry.getCommands()).toHaveLength(1);
    });
  });

  describe('removeAllForPlugin', () => {
    it('removes all commands for a given plugin', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd 1', callback: vi.fn() });
      registry.addCommand('plugin-a', { id: 'cmd2', name: 'Cmd 2', callback: vi.fn() });
      registry.addCommand('plugin-b', { id: 'cmd3', name: 'Cmd 3', callback: vi.fn() });

      registry.removeAllForPlugin('plugin-a');

      const commands = registry.getCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0]!.id).toBe('plugin-b:cmd3');
    });

    it('removes associated hotkeys for all plugin commands', () => {
      registry.addCommand('plugin-a', {
        id: 'cmd1',
        name: 'Cmd 1',
        callback: vi.fn(),
        hotkeys: [{ modifiers: ['Ctrl'], key: 'K' }],
      });
      registry.addCommand('plugin-a', {
        id: 'cmd2',
        name: 'Cmd 2',
        callback: vi.fn(),
        hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'P' }],
      });

      registry.removeAllForPlugin('plugin-a');

      const hotkeys = registry.getRegisteredHotkeys();
      expect(hotkeys.size).toBe(0);
    });

    it('does nothing if plugin has no commands', () => {
      registry.addCommand('plugin-b', { id: 'cmd1', name: 'Cmd 1', callback: vi.fn() });
      registry.removeAllForPlugin('plugin-a');

      expect(registry.getCommands()).toHaveLength(1);
    });
  });

  describe('searchCommands', () => {
    it('returns commands matching case-insensitive substring on name', () => {
      registry.addCommand('p', { id: 'a', name: 'Open Daily Note', callback: vi.fn() });
      registry.addCommand('p', { id: 'b', name: 'Toggle Sidebar', callback: vi.fn() });
      registry.addCommand('p', { id: 'c', name: 'Open Graph View', callback: vi.fn() });

      const results = registry.searchCommands('open');
      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('Open Daily Note');
      expect(results.map(r => r.name)).toContain('Open Graph View');
    });

    it('is case-insensitive', () => {
      registry.addCommand('p', { id: 'a', name: 'Toggle DARK Mode', callback: vi.fn() });

      expect(registry.searchCommands('dark')).toHaveLength(1);
      expect(registry.searchCommands('TOGGLE')).toHaveLength(1);
      expect(registry.searchCommands('Dark')).toHaveLength(1);
    });

    it('returns at most 50 results', () => {
      for (let i = 0; i < 60; i++) {
        registry.addCommand('p', { id: `cmd${i}`, name: `Command ${i}`, callback: vi.fn() });
      }

      const results = registry.searchCommands('Command');
      expect(results).toHaveLength(50);
    });

    it('returns all commands (up to 50) when query is empty', () => {
      for (let i = 0; i < 10; i++) {
        registry.addCommand('p', { id: `cmd${i}`, name: `Cmd ${i}`, callback: vi.fn() });
      }

      const results = registry.searchCommands('');
      expect(results).toHaveLength(10);
    });

    it('returns empty array when no commands match', () => {
      registry.addCommand('p', { id: 'a', name: 'Open File', callback: vi.fn() });

      const results = registry.searchCommands('zzz');
      expect(results).toHaveLength(0);
    });
  });

  describe('executeCommand', () => {
    it('calls the command callback', () => {
      const callback = vi.fn();
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd 1', callback });

      registry.executeCommand('plugin-a:cmd1');

      expect(callback).toHaveBeenCalledOnce();
    });

    it('catches and logs exceptions from the callback (does not propagate)', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback = vi.fn(() => { throw new Error('Boom'); });
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd 1', callback });

      // Should NOT throw
      expect(() => registry.executeCommand('plugin-a:cmd1')).not.toThrow();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Exception executing command'),
        expect.any(Error)
      );

      consoleError.mockRestore();
    });

    it('logs a warning when command ID is not found', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.executeCommand('non-existent:cmd');

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Command not found')
      );

      consoleWarn.mockRestore();
    });
  });

  describe('hotkey registration', () => {
    it('registers a hotkey and maps it to a command', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd', callback: vi.fn() });
      const success = registry.registerHotkey('plugin-a:cmd1', { modifiers: ['Ctrl'], key: 'B' });

      expect(success).toBe(true);
      expect(registry.getRegisteredHotkeys().get('ctrl+b')).toBe('plugin-a:cmd1');
    });

    it('detects conflict when hotkey is already registered to another command', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.addCommand('plugin-a', {
        id: 'cmd1',
        name: 'Cmd 1',
        callback: vi.fn(),
        hotkeys: [{ modifiers: ['Ctrl'], key: 'K' }],
      });

      // Try to register same hotkey for a different command
      const success = registry.registerHotkey('plugin-b:cmd2', { modifiers: ['Ctrl'], key: 'K' });

      expect(success).toBe(false);
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Hotkey conflict')
      );

      // Original registration still holds
      expect(registry.getRegisteredHotkeys().get('ctrl+k')).toBe('plugin-a:cmd1');

      consoleWarn.mockRestore();
    });

    it('allows re-registration of same hotkey to same command (idempotent)', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd', callback: vi.fn() });
      registry.registerHotkey('plugin-a:cmd1', { modifiers: ['Ctrl'], key: 'K' });
      const success = registry.registerHotkey('plugin-a:cmd1', { modifiers: ['Ctrl'], key: 'K' });

      expect(success).toBe(true);
    });

    it('normalizes modifiers case and order for conflict detection', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.addCommand('plugin-a', {
        id: 'cmd1',
        name: 'Cmd 1',
        callback: vi.fn(),
        hotkeys: [{ modifiers: ['Shift', 'Ctrl'], key: 'P' }],
      });

      // Same hotkey with different modifier order and casing
      const success = registry.registerHotkey('plugin-b:cmd2', { modifiers: ['ctrl', 'shift'], key: 'p' });

      expect(success).toBe(false);

      consoleWarn.mockRestore();
    });

    it('unregisters a hotkey for a command', () => {
      registry.addCommand('plugin-a', { id: 'cmd1', name: 'Cmd', callback: vi.fn() });
      registry.registerHotkey('plugin-a:cmd1', { modifiers: ['Ctrl'], key: 'B' });

      registry.unregisterHotkey('plugin-a:cmd1', { modifiers: ['Ctrl'], key: 'B' });

      expect(registry.getRegisteredHotkeys().size).toBe(0);
    });

    it('does not unregister a hotkey owned by another command', () => {
      registry.addCommand('plugin-a', {
        id: 'cmd1',
        name: 'Cmd 1',
        callback: vi.fn(),
        hotkeys: [{ modifiers: ['Ctrl'], key: 'K' }],
      });

      // Try to unregister with wrong command ID
      registry.unregisterHotkey('plugin-b:cmd2', { modifiers: ['Ctrl'], key: 'K' });

      expect(registry.getRegisteredHotkeys().get('ctrl+k')).toBe('plugin-a:cmd1');
    });
  });

  describe('getCommands', () => {
    it('returns an empty array when no commands are registered', () => {
      expect(registry.getCommands()).toEqual([]);
    });

    it('returns a copy (not a reference to internal state)', () => {
      registry.addCommand('p', { id: 'cmd1', name: 'Cmd', callback: vi.fn() });
      const commands1 = registry.getCommands();
      const commands2 = registry.getCommands();

      expect(commands1).not.toBe(commands2);
      expect(commands1).toEqual(commands2);
    });
  });
});
