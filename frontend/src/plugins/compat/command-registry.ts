import type { Hotkey } from './types';
import type { IEditor } from './editor-shim';
import { withPluginContext } from './plugin-execution-context';

/**
 * EditorCommandContext — Context passed to editorCallback/editorCheckCallback.
 * Provides the active editor and a view-like object (MarkdownView or MarkdownFileInfo).
 */
export interface EditorCommandContext {
  editor: IEditor;
  file: { path: string; basename: string; extension: string } | null;
}

/** Function that resolves the active editor context, or null if no editor is active. */
export type EditorContextResolver = () => EditorCommandContext | null;

/**
 * Command — A registered command in the command registry.
 * ID format: <pluginId>:<commandId>
 */
export interface Command {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: IEditor, ctx: unknown) => void;
  editorCheckCallback?: (checking: boolean, editor: IEditor, ctx: unknown) => boolean | void;
  hotkeys?: Hotkey[];
  pluginId: string;
}

/** Input shape for addCommand (what plugins pass). */
export interface CommandInput {
  id: string;
  name: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: IEditor, ctx: unknown) => void;
  editorCheckCallback?: (checking: boolean, editor: IEditor, ctx: unknown) => boolean | void;
  hotkeys?: Hotkey[];
}

/**
 * ICommandRegistry — Interface for command registration, search, and execution.
 */
export interface ICommandRegistry {
  addCommand(pluginId: string, command: CommandInput): Command;
  removeCommand(commandId: string): void;
  removeAllForPlugin(pluginId: string): void;
  getCommands(): Command[];
  getCommand(commandId: string): Command | undefined;
  executeCommand(commandId: string): void;
  searchCommands(query: string): Command[];
  registerHotkey(commandId: string, hotkey: Hotkey): boolean;
  unregisterHotkey(commandId: string, hotkey: Hotkey): void;
  getRegisteredHotkeys(): Map<string, string>;
  setEditorContextResolver(resolver: EditorContextResolver): void;
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
  /** Resolver for getting the active editor context (set by plugin-context). */
  private editorContextResolver: EditorContextResolver | null = null;

  /**
   * Set the resolver function that provides the active editor context.
   * Called by the PluginProvider to wire the EditorShim + active file.
   */
  setEditorContextResolver(resolver: EditorContextResolver): void {
    this.editorContextResolver = resolver;
  }

  /**
   * Register a command for a plugin.
   * The command ID is namespaced as <pluginId>:<commandId>.
   * If the command defines hotkeys, they are registered with conflict detection.
   * Returns the registered Command (matches Obsidian's Plugin.addCommand, which
   * plugins rely on to stash a reference, e.g. `this.forceSaveCommand = this.addCommand(...)`).
   */
  addCommand(pluginId: string, command: CommandInput): Command {
    const namespacedId = `${pluginId}:${command.id}`;

    const cmd: Command = {
      id: namespacedId,
      name: command.name,
      callback: command.callback,
      checkCallback: command.checkCallback,
      editorCallback: command.editorCallback,
      editorCheckCallback: command.editorCheckCallback,
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

    return cmd;
  }

  /**
   * Look up a single command by its full namespaced ID.
   */
  getCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId);
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
  /**
   * Execute a command by its full namespaced ID.
   * Wraps the callback in try/catch — exceptions are logged and do not propagate.
   *
   * Priority (matches Obsidian):
   * 1. editorCheckCallback (if editor is active)
   * 2. editorCallback (if editor is active)
   * 3. checkCallback
   * 4. callback
   *
   * editorCallback/editorCheckCallback are only invoked when an editor is active.
   * If no editor is active, falls through to checkCallback/callback.
   */
  executeCommand(commandId: string): void {
    const cmd = this.commands.get(commandId);
    if (!cmd) {
      console.warn(`[CommandRegistry] Command not found: "${commandId}"`);
      return;
    }

    try {
      // Scoped so createEl() calls made by the callback (e.g. building a modal)
      // get tagged with this command's owning plugin — see plugin-execution-context.ts.
      withPluginContext(cmd.pluginId, () => {
        // Try editor-specific callbacks first (only when editor is active)
        const editorCtx = this.editorContextResolver?.();

        if (editorCtx && cmd.editorCheckCallback) {
          const available = cmd.editorCheckCallback(true, editorCtx.editor, editorCtx);
          if (available !== false) {
            cmd.editorCheckCallback(false, editorCtx.editor, editorCtx);
          }
          return;
        }

        if (editorCtx && cmd.editorCallback) {
          cmd.editorCallback(editorCtx.editor, editorCtx);
          return;
        }

        // Fall through to regular callbacks
        if (cmd.checkCallback) {
          const available = cmd.checkCallback(true);
          if (available !== false) {
            cmd.checkCallback(false);
          }
        } else if (cmd.callback) {
          cmd.callback();
        }
      });
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
