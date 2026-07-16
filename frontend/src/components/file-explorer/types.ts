/**
 * Shared types for the FileExplorer component family.
 */

import type { DirectoryTree } from '../../types'

/**
 * Internal drag state for the FileExplorer.
 */
export interface DragState {
  draggedPath: string | null
  draggedVaultId: string | null
  validTargets: Set<string>
  isMoving: boolean
}

/**
 * State for tracking external file drag-over on individual folders.
 */
export interface ExternalDropState {
  /** Path of the folder currently being hovered by an external file drag. */
  targetPath: string | null
  /** Vault ID for the external drop target. */
  targetVaultId: string | null
}

/**
 * State for the context menu.
 */
export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  targetNode: DirectoryTree | null
  vaultId: string | null
}

/**
 * State for the inline input (new file / new folder / rename / new canvas).
 */
export interface InlineInputState {
  visible: boolean
  mode: 'newFile' | 'newFolder' | 'rename' | 'newCanvas'
  parentPath: string
  node: DirectoryTree | null
  vaultId: string | null
}
