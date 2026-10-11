/**
 * The slash-command suggest source — an internal (non-plugin) EditorSuggest
 * instance plugged into the existing EditorSuggestManager. It reuses the whole
 * suggest infrastructure (trigger loop, positioned popover, Arrow/Enter/Escape
 * keymap, stale-guard, "one suggest at a time" arbitration) and only supplies:
 * the `/` trigger, the filtered command list, item rendering, and the action.
 *
 * On selection it deletes the typed `/…` trigger text FIRST, then runs the
 * action, so e.g. "insert table" lands at a clean cursor rather than behind a
 * leftover `/table`. Core-command entries run through the CommandRegistry (one
 * shared implementation with the Command Palette); date/time entries dispatch
 * their text straight to CM6.
 *
 * @module editor/slash/slash-suggest-source
 */

import type { EditorView } from '@codemirror/view'
import type {
  EditorSuggestInstance,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
} from '../../plugins/compat/editor-suggest-manager'
import type { EditorPosition, IEditor } from '../../plugins/compat/editor-shim'
import type { ICommandRegistry } from '../../plugins/compat/command-registry'
import { renderComponentIcon } from '../../plugins/compat/obsidian-api-extensions'
import { fuzzyMatch } from '../../utils/fuzzyMatch'
import { SLASH_COMMANDS, type SlashCommand } from './slash-commands'
import { getSlashLabel, type SlashLocale } from './slash-command-i18n'
import { detectSlashTrigger } from './slash-trigger'

/** Dependencies the suggest source needs from the host editor/plugin layer. */
export interface SlashSuggestDeps {
  /** The active CM6 EditorView (for trigger detection + direct dispatch). */
  getActiveEditorView: () => EditorView | null
  /** The command registry used to execute core-command actions. */
  getCommandRegistry: () => ICommandRegistry | null
  /** Current UI locale for labels. */
  getLocale: () => SlashLocale
}

/** A scored, display-ready menu entry. */
interface SlashItem {
  command: SlashCommand
  label: string
}

/**
 * Build the EditorSuggest instance for the slash menu. Returned as an
 * `EditorSuggestInstance` so it can be handed straight to
 * `EditorSuggestManager.register()`.
 */
export function createSlashSuggestSource(deps: SlashSuggestDeps): EditorSuggestInstance {
  // The manager calls close() — which nulls `this.context` — BEFORE it calls
  // selectSuggestion(). So we cannot read the trigger range off `this.context`
  // at selection time; it is already gone. Keep our own snapshot in this
  // closure (the manager never touches our private fields) and clear it on
  // close(). Captured in getSuggestions, which the manager calls on every
  // (re-)trigger with the current context.
  let triggerSnapshot: { editor: IEditor; start: EditorPosition; end: EditorPosition } | null = null

  return {
    context: null,
    limit: 20,

    onTrigger(cursor: EditorPosition, editor: IEditor): EditorSuggestTriggerInfo | null {
      const view = deps.getActiveEditorView()
      if (!view) return null
      const cursorOffset = editor.posToOffset(cursor)
      const trigger = detectSlashTrigger(view.state, cursorOffset)
      if (!trigger) return null
      return {
        start: editor.offsetToPos(trigger.from),
        end: editor.offsetToPos(trigger.to),
        query: trigger.query,
      }
    },

    getSuggestions(context: EditorSuggestContext): SlashItem[] {
      // Snapshot the trigger range so selectSuggestion can delete the `/…`
      // text even after the manager has closed (and nulled this.context).
      triggerSnapshot = { editor: context.editor, start: context.start, end: context.end }

      const registry = deps.getCommandRegistry()
      const locale = deps.getLocale()
      const query = context.query.trim()

      const available = SLASH_COMMANDS.filter((cmd) => {
        // A core-command entry is only offered if the command actually
        // resolves (feature on, registered) — never a silent no-op.
        if (cmd.commandId) return registry?.getCommand(cmd.commandId) !== undefined
        return true
      })

      const scored: Array<{ item: SlashItem; score: number }> = []
      for (const command of available) {
        const label = getSlashLabel(command.id, locale)
        if (query.length === 0) {
          scored.push({ item: { command, label }, score: 0 })
          continue
        }
        const score = fuzzyMatch(query, label)
        if (score !== null) scored.push({ item: { command, label }, score })
      }

      // Preserve declared order for the empty query; otherwise best score first.
      if (query.length > 0) scored.sort((a, b) => a.score - b.score)
      return scored.map((s) => s.item)
    },

    renderSuggestion(value: unknown, el: HTMLElement): void {
      const item = value as SlashItem
      // Defensive: the shared popover clears rows before re-render today, but
      // decouple from that assumption so a non-clearing host can't stack rows.
      el.textContent = ''
      el.classList.add('slash-suggestion-item')

      const iconEl = document.createElement('span')
      iconEl.className = 'slash-suggestion-icon'
      iconEl.setAttribute('aria-hidden', 'true')
      // Shared resolver: custom icons → Lucide, with the same async fill-in
      // every other render site uses (icons are preloaded before plugins load).
      renderComponentIcon(iconEl, item.command.icon)
      el.appendChild(iconEl)

      const labelEl = document.createElement('span')
      labelEl.className = 'slash-suggestion-label'
      labelEl.textContent = item.label
      el.appendChild(labelEl)
    },

    selectSuggestion(value: unknown): void {
      const item = value as SlashItem
      const view = deps.getActiveEditorView()
      // Prefer our own snapshot: the manager has already nulled this.context
      // by the time this runs (close() before selectSuggestion). Fall back to
      // this.context for any caller that does NOT follow that ordering.
      const range = triggerSnapshot ?? (this.context
        ? { editor: this.context.editor, start: this.context.start, end: this.context.end }
        : null)
      if (!range || !view) return

      // Delete the typed `/…` trigger text FIRST, so the action runs at a
      // clean cursor rather than behind the leftover `/filter`.
      const from = range.editor.posToOffset(range.start)
      const to = range.editor.posToOffset(range.end)
      view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
      })

      if (item.command.insert) {
        item.command.insert(view)
        return
      }
      if (item.command.commandId) {
        deps.getCommandRegistry()?.executeCommand(item.command.commandId)
      }
    },

    // The manager drives open/close; these satisfy the interface and reset state.
    close(): void {
      this.context = null
      // Deliberately do NOT clear triggerSnapshot here: the manager calls
      // close() immediately BEFORE selectSuggestion(), which still needs the
      // range. The snapshot is overwritten on the next trigger's getSuggestions,
      // so it cannot leak into an unrelated later selection.
    },
    open(): void {
      // No-op: the manager renders via the shared popover.
    },
  }
}
