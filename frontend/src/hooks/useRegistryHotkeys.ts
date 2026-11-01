import { useEffect } from 'react'
import { OBSIDIAN_COMMAND_ALIASES } from '@slatebase/shared-contracts'
import type { Command, ICommandRegistry } from '../plugins/compat/command-registry'
import { DEFAULT_KEYBINDINGS, getShortcuts, matchesParsed, matchesShortcut, parseShortcut, isOverridden } from '../state/keybindingsStore'

/** Obsidian IDs of commands Slatebase handles natively (their own keydown handlers). */
export const NATIVE_TWINS: ReadonlySet<string> = new Set(Object.values(OBSIDIAN_COMMAND_ALIASES))

/** Targets that keep their keys: a text field is not an editor. The note editor is contenteditable and stays allowed. */
function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

/** The shortcuts a registry command answers to: the vault's file, else the hotkeys the command declares. */
export function registryShortcuts(command: Command): string[] {
  if (isOverridden(command.id)) return getShortcuts(command.id)
  return (command.hotkeys ?? [])
    .filter((h) => h.key)
    .map((h) => [...h.modifiers, h.key.length === 1 ? h.key.toUpperCase() : h.key].join('+'))
}

/**
 * The command a key press runs, or null. A bare letter never counts (it would swallow typing); the
 * press needs Ctrl, Alt or Cmd, or is a function key. Commands Slatebase handles itself are skipped.
 */
export function findRegistryCommand(event: KeyboardEvent, commands: Command[]): Command | null {
  if (event.defaultPrevented || event.isComposing || event.repeat) return null
  const hasModifier = event.ctrlKey || event.altKey || event.metaKey
  if (!hasModifier && !/^F\d{1,2}$/.test(event.key)) return null
  if (isTextField(event.target)) return null
  // Slatebase's own commands take their keys first, whatever order the listeners run in.
  if (DEFAULT_KEYBINDINGS.some(d => matchesShortcut(d.commandId, event))) return null
  for (const command of commands) {
    if (NATIVE_TWINS.has(command.id)) continue
    for (const shortcut of registryShortcuts(command)) {
      const parsed = parseShortcut(shortcut)
      if (parsed && matchesParsed(parsed, event)) return command
    }
  }
  return null
}

/**
 * Runs registry commands (Obsidian's core commands and plugins') from the shortcuts of the vault's
 * hotkeys.json. A key the editor or a native handler already took (`defaultPrevented`) is left alone,
 * and so is a key whose command cannot run now (no editor open): the browser keeps it then.
 * Does nothing while `enabled` is false (the plugin compatibility feature is off).
 */
export function useRegistryHotkeys(registry: ICommandRegistry, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const command = findRegistryCommand(event, registry.getCommands())
      if (!command || !registry.canExecute(command.id)) return
      event.preventDefault()
      registry.executeCommand(command.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [registry, enabled])
}
