import type { Hotkey } from './types';

/**
 * Command — A registered command in the command registry.
 * ID format: <pluginId>:<commandId>
 */
export interface Command {
  id: string;
  name: string;
  callback: () => void;
  hotkeys?: Hotkey[];
  pluginId: string;
}

/**
 * ICommandRegistry — Interface for command registration, search, and execution.
 */
export interface ICommandRegistry {
  addCommand(pluginId: string, command: { id: string; name: string; callback: () => void; hotkeys?: Hotkey[] }): void;
  removeCommand(commandId: string): void;
  removeAllForPlugin(pluginId: string): void;
  getCommands(): Command[];
  executeCommand(commandId: string): void;
  searchCommands(query: string): Command[];
  registerHotkey(commandId: string, hotkey: Hotkey): boolean;
  unregisterHotkey(commandId: string, hotkey: Hotkey): void;
  getRegisteredHotkeys(): Map<string, string>;
}

/** Maximum number of search results returned by searchCommands */
const MAX_SEARCH_RESULTS = 50;

/**
 * Normalize a hotkey to a canonical string for conflict detection.
 * Modifiers are sorted alphabetically to ensure consistent comparison.
 */
function normalizeHotkey(hotkey: Hotkey): string {
  const mods = [...hotkey.modifiers].sort().map(m => m.toLowerCase());
  return [...mods, hotkey.key.toLowerCase()].join('+');
}

/**
 * CommandRegistry — Manages plugin commands with namespaced IDs,
 * case-insensitive search, hotkey registration, and conflict detection.
 *
 * - Commands are stored in a Map<string, Command> keyed by namespaced ID (<pluginId>:<commandId>)
 * - Search is case-insensitive substring match on command name, max 50 results
 * - executeCommand wraps callback in try/catch (R12.7)
 * - Hotkey conflicts are detected and logged (R12.8)
 */
export class CommandRegistry implements ICommandRegistry {
  private commands: Map<string, Command> = new Map();
  /** Map of normalized hotkey string → commandId that owns it */
  private hotkeys: Map<string, string> = new Map();

  /**
   * Register a command for a plugin.
   * The command ID is namespaced as <pluginId>:<commandId>.
   * If the command defines hotkeys, they are registered with conflict detection.
   */
  addCommand(pluginId: string, command: { id: string; name: string; callback: () => void; hotkeys?: Hotkey[] }): void {
    const namespacedId = `${pluginId}:${command.id}`;

    const cmd: Command = {
      id: namespacedId,
      name: command.name,
      callback: command.callback,
      hotkeys: command.hotkeys,
      pluginId,
    };

    this.commands.set(namespacedId, cmd);

    // Register hotkeys if provided
    if (command.hotkeys) {
      for (const hotkey of command.hotkeys) {
        this.registerHotkey(namespacedId, hotkey);
      }
    }
  }

  /**
   * Remove a command by its full namespaced ID.
   * Also removes all hotkey registrations for this command.
   */
  removeCommand(commandId: string): void {
    const cmd = this.commands.get(commandId);
    if (!cmd) return;

    // Remove all hotkeys associated with this command
    if (cmd.hotkeys) {
      for (const hotkey of cmd.hotkeys) {
        this.unregisterHotkey(commandId, hotkey);
      }
    }

    this.commands.delete(commandId);
  }

  /**
   * Remove all commands registered by a specific plugin.
   * Also clears all hotkey registrations for those commands.
   */
  removeAllForPlugin(pluginId: string): void {
    const toRemove: string[] = [];

    for (const [id, cmd] of this.commands) {
      if (cmd.pluginId === pluginId) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeCommand(id);
    }
  }

  /**
   * Get all registered commands.
   */
  getCommands(): Command[] {
    return [...this.commands.values()];
  }

  /**
   * Execute a command by its full namespaced ID.
   * Wraps the callback in try/catch — exceptions are logged and do not propagate.
   */
  executeCommand(commandId: string): void {
    const cmd = this.commands.get(commandId);
    if (!cmd) {
      console.warn(`[CommandRegistry] Command not found: "${commandId}"`);
      return;
    }

    try {
      cmd.callback();
    } catch (err) {
      console.error(
        `[CommandRegistry] Exception executing command "${commandId}":`,
        err
      );
    }
  }

  /**
   * Search commands by case-insensitive substring match on name.
   * Returns at most 50 results.
   */
  searchCommands(query: string): Command[] {
    if (!query) {
      // Return all commands (capped at MAX_SEARCH_RESULTS)
      const all = this.getCommands();
      return all.slice(0, MAX_SEARCH_RESULTS);
    }

    const lowerQuery = query.toLowerCase();
    const results: Command[] = [];

    for (const cmd of this.commands.values()) {
      if (cmd.name.toLowerCase().includes(lowerQuery)) {
        results.push(cmd);
        if (results.length >= MAX_SEARCH_RESULTS) break;
      }
    }

    return results;
  }

  /**
   * Register a hotkey for a command.
   * If the hotkey is already registered to another command, the registration
   * is ignored and a warning is logged (R12.8).
   * @returns true if successfully registered, false if conflict detected
   */
  registerHotkey(commandId: string, hotkey: Hotkey): boolean {
    const normalized = normalizeHotkey(hotkey);
    const existing = this.hotkeys.get(normalized);

    if (existing && existing !== commandId) {
      console.warn(
        `[CommandRegistry] Hotkey conflict: "${normalized}" is already registered to command "${existing}". ` +
        `Ignoring registration for command "${commandId}".`
      );
      return false;
    }

    this.hotkeys.set(normalized, commandId);
    return true;
  }

  /**
   * Unregister a hotkey for a command.
   * Only removes if the hotkey is actually owned by the given command.
   */
  unregisterHotkey(commandId: string, hotkey: Hotkey): void {
    const normalized = normalizeHotkey(hotkey);
    const owner = this.hotkeys.get(normalized);

    if (owner === commandId) {
      this.hotkeys.delete(normalized);
    }
  }

  /**
   * Get all registered hotkeys as a map of normalized hotkey string → commandId.
   */
  getRegisteredHotkeys(): Map<string, string> {
    return new Map(this.hotkeys);
  }
}
