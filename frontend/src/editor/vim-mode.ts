/**
 * Vim key bindings for the editor (`vimMode` in the vault's `.obsidian/app.json`).
 *
 * The engine is `@replit/codemirror-vim`, loaded on first use: a vault that never turns Vim mode on
 * does not download it. The extension must come before the other key maps of an editor to see keys
 * first (see the library's notes), so the editor places its compartment at the start of the list.
 *
 * @module editor/vim-mode
 */
import type { Extension } from '@codemirror/state'

type VimModule = typeof import('@replit/codemirror-vim')

let loaded: VimModule | null = null
let loading: Promise<VimModule> | null = null

/** The Vim extension if the module is already loaded, else `[]` (call {@link loadVimExtension} first). */
export function vimExtensionIfLoaded(): Extension {
  return loaded ? loaded.vim() : []
}

/** Loads the module once and returns a fresh Vim extension. Rejects if the chunk cannot be fetched. */
export async function loadVimExtension(): Promise<Extension> {
  loading ??= import('@replit/codemirror-vim').then((module) => {
    loaded = module
    return module
  }, (error: unknown) => {
    loading = null
    throw error
  })
  return (await loading).vim()
}

/** The engine's global `Vim` API if the module is already loaded (what plugins reach for as `CodeMirrorAdapter.Vim`). */
export function getLoadedVimApi(): VimModule['Vim'] | null {
  return loaded ? loaded.Vim : null
}

/** Loads the module without building an extension. Same one-time load as {@link loadVimExtension}. */
export async function loadVimModule(): Promise<VimModule> {
  await loadVimExtension()
  return loaded as VimModule
}
