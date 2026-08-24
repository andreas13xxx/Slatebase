/**
 * Convenience wrappers used by context menus outside the File Explorer (tab
 * bar, backlinks/outgoing links, search results, graph nodes) to reveal,
 * rename, or delete a file via the explorer's own UI.
 *
 * Each first activates the 'file-explorer' panel view through the same core
 * command the command palette uses (`file-explorer:open`, registered in
 * core-commands-app.ts) — this both makes the panel visible and mounts the
 * File Explorer if it wasn't already, so its `slatebase:reveal-file` /
 * `slatebase:rename-file` / `slatebase:delete-file` listener exists to
 * receive the request that follows.
 */
import { requestReveal } from './revealFileBridge'
import { requestRename, requestDelete } from './fileOpBridge'

interface ExecuteCommandGlobal {
  app?: { commands?: { executeCommandById?: (id: string) => void } }
}

function activateExplorerPanel(): void {
  (window as unknown as ExecuteCommandGlobal).app?.commands?.executeCommandById?.('file-explorer:open')
}

export function revealInExplorer(path: string, kind: 'file' | 'folder' = 'file'): void {
  activateExplorerPanel()
  requestReveal(path, kind)
}

export function renameInExplorer(path: string, kind: 'file' | 'folder' = 'file'): void {
  activateExplorerPanel()
  requestRename(path, kind)
}

export function deleteInExplorer(path: string, kind: 'file' | 'folder' = 'file'): void {
  activateExplorerPanel()
  requestDelete(path, kind)
}
