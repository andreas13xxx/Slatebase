/**
 * Live DOM registry for the file explorer's tree rows.
 *
 * Backs `workspace.getLeavesOfType('file-explorer')[0].view.fileItems` — real
 * Obsidian's supported (if undocumented) path for plugins that inject DOM
 * directly into a file/folder row instead of going through a public API.
 * Iconize (`obsidian-icon-folder`) is the primary known consumer: it looks up
 * `fileItems[path]`, then `titleEl.querySelector('.iconize-icon')` to decide
 * whether to insert its own icon element.
 *
 * Slatebase's tree is React-rendered. `titleEl` here is deliberately the
 * row's title `<button>` (see TreeNode.tsx), not a wrapper built specifically
 * for this — that button's own React children (icon, name, star) have a
 * stable count/order across re-renders, so React only ever touches the
 * specific child fibers it owns (e.g. a targeted text-node update). Anything
 * a plugin appends to the button as an extra child (an `.iconize-icon` span)
 * is invisible to React's reconciler and survives ordinary re-renders. It's
 * only lost when the row itself unmounts — a folder collapsing, a rename
 * (which changes the row's React `key`), or the file being deleted — at
 * which point `unregisterFileExplorerRow` below removes the stale entry, and
 * a plugin listening for the matching `vault`/`workspace` event (as Iconize
 * does for renames) is expected to re-apply its DOM on the new row.
 *
 * Known deviations from real Obsidian, worth keeping in mind when debugging:
 * - `fileItems` only contains rows currently mounted in the DOM (i.e. inside
 *   an expanded folder). Real Obsidian keeps the whole vault's file items
 *   resident regardless of expand state. Collapsing a folder here removes its
 *   descendants from `fileItems`, same as if they didn't exist yet.
 * - Rows are keyed by vault-relative path only, matching Obsidian's own
 *   single-vault `fileItems` shape. Slatebase's sidebar can show multiple
 *   vaults expanded at once; if two vaults share an overlapping path,
 *   whichever row (re-)registered most recently wins.
 *
 * @module file-explorer-dom-registry
 */

import type { TAbstractFile } from './types'
import { buildTFileFromPath, buildTFolderFromPath } from './plugin-event-bridge'

/** Obsidian's `FileItem` shape, as far as Slatebase emulates it. */
export interface FileExplorerFileItem {
  /** The TFile/TFolder this row represents. */
  file: TAbstractFile
  /** The row's title element — safe to append/query custom child elements into. */
  titleEl: HTMLElement
  /** The row's outer container element (its `<li>`). */
  selfEl: HTMLElement
}

const items = new Map<string, FileExplorerFileItem>()

/** Called by TreeNode when a file/folder row's title element mounts. */
export function registerFileExplorerRow(
  path: string,
  name: string,
  type: 'file' | 'directory',
  titleEl: HTMLElement,
): void {
  const selfEl = titleEl.closest('li') ?? titleEl
  const file: TAbstractFile = type === 'file' ? buildTFileFromPath(path) : buildTFolderFromPath(path, name)
  items.set(path, { file, titleEl, selfEl })
}

/** Called by TreeNode when a file/folder row's title element unmounts. */
export function unregisterFileExplorerRow(path: string): void {
  items.delete(path)
}

/** Direct Map access for internal callers (view construction, tests). */
export function getFileExplorerItemsMap(): ReadonlyMap<string, FileExplorerFileItem> {
  return items
}

/**
 * Builds the plugin-facing `fileItems` object. Backed live by the registry —
 * `fileItems[path]` always reflects whatever is currently mounted, not a
 * snapshot taken when this was constructed. Unknown paths read as
 * `undefined` rather than throwing, matching plain-object index access.
 */
export function createFileItemsProxy(): Record<string, FileExplorerFileItem | undefined> {
  return new Proxy({} as Record<string, FileExplorerFileItem | undefined>, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      return items.get(prop)
    },
    has(_target, prop) {
      return typeof prop === 'string' && items.has(prop)
    },
    ownKeys() {
      return [...items.keys()]
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string' && items.has(prop)) {
        return { enumerable: true, configurable: true, value: items.get(prop) }
      }
      return undefined
    },
  })
}

/** Test-only: clear all registered rows. */
export function clearFileExplorerDomRegistry(): void {
  items.clear()
}
