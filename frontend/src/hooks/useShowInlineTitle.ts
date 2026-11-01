/**
 * useShowInlineTitle — whether the note's file name is shown as an inline title (an H1) above the
 * document, as in Obsidian. A vault setting stored in `.obsidian/app.json` (`showInlineTitle`), the
 * same key Obsidian uses, so it is the same for everyone who opens the vault and changing it needs
 * write access.
 *
 * Reached through Settings → Editor and files; the title itself is pure presentation and is not part
 * of the note's content.
 */
import { toggleAppConfigFlag } from './appConfigToggle'
import { useAppConfigValue } from '../state/vaultAppConfigStore'

/** Toggles the inline title from outside React (command palette). */
export function toggleShowInlineTitle(): void {
  toggleAppConfigFlag('showInlineTitle')
}

/** Inline-title state for the active vault. */
export function useShowInlineTitle(): boolean {
  return useAppConfigValue('showInlineTitle')
}

/**
 * Derives the title shown from a file path: the base name without the `.md` extension. A non-markdown
 * file keeps its extension (matches Obsidian, which only shows the inline title for notes).
 */
export function inlineTitleFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.endsWith('.md') ? base.slice(0, -3) : base
}
