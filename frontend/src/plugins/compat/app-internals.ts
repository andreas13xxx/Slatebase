/**
 * Members of Obsidian's undocumented `App` that do not depend on a plugin's own shims.
 *
 * Two objects present `app` to plugins: each plugin's `AppShim` and the bootstrap `window.app`
 * stub (views driven through `createFileView` and libraries reading the global). Both take their
 * members from `createAppInternals()`, so a plugin finds the same API whichever it reaches.
 * Source of the member list: `@obsidian-typings/obsidian-public-1.15.1`.
 *
 * Every member is either implemented, or answers honestly (`warnNoOp`) when the browser cannot
 * provide it — never a silent no-op.
 */
import { buildDeepLink } from '../../deep-link/deepLink'
import { getFoldVault, loadFileFolds, saveFileFolds, type FoldedLine } from '../../editor/foldPersistence'
import { debugOnce, warnNoOp } from './log'

type FileLike = { path?: string } | string | null | undefined

function pathOf(file: FileLike): string | null {
  const path = typeof file === 'string' ? file : file?.path
  return path ? path : null
}

/** Wikilink text a dragged file drops into an editor: `[[Folder/Note]]` (no `.md`). */
function wikilinkFor(path: string): string {
  return `[[${path.replace(/\.md$/i, '')}]]`
}

function startDrag(evt: DragEvent, text: string): void {
  evt.dataTransfer?.setData('text/plain', text)
  if (evt.dataTransfer) evt.dataTransfer.effectAllowed = 'all'
}

/** Desktop-only methods: honest `warn` plus the answer a caller can act on. */
function desktopOnly<A extends unknown[], R>(method: string, detail: string, result: R): (...args: A) => R {
  return () => {
    warnNoOp('App', method, detail)
    return result
  }
}

function createDragManager() {
  return {
    /** Obsidian's currently running drag payload; `null` while nothing is dragged. */
    draggable: null as unknown,
    dragFile(evt: DragEvent, file: FileLike, _sourcePath?: string): unknown {
      const path = pathOf(file)
      if (path) startDrag(evt, wikilinkFor(path))
      return { source: 'file', type: 'file', file, title: path ?? '' }
    },
    dragFiles(evt: DragEvent, files: FileLike[], _sourcePath?: string): unknown {
      const paths = files.map(pathOf).filter((p): p is string => p !== null)
      if (paths.length > 0) startDrag(evt, paths.map(wikilinkFor).join('\n'))
      return { source: 'files', type: 'files', files, title: `${paths.length}` }
    },
    dragLink(evt: DragEvent, linkText: string, _sourcePath?: string, title?: string): unknown {
      startDrag(evt, `[[${linkText}]]`)
      return { source: 'link', type: 'link', linktext: linkText, title: title ?? linkText }
    },
    onDragStart(evt: DragEvent, draggable: unknown): void {
      const text = (draggable as { linktext?: string; file?: FileLike } | null)
      const path = pathOf(text?.file)
      if (path) startDrag(evt, wikilinkFor(path))
      else if (text?.linktext) startDrag(evt, `[[${text.linktext}]]`)
    },
    handleDrop(): void {
      warnNoOp('App.dragManager', 'handleDrop', 'Slatebase has no drop-target registry; handle `drop` on the element directly.')
    },
  }
}

function createFoldManager() {
  // Obsidian persists per-file fold state here. Slatebase's editor keeps the same list per vault
  // and file (`editor/foldPersistence.ts`), so a plugin reads and writes what the editor restores.
  return {
    load(file: { path?: string } | null): { folds: FoldedLine[]; lines: number } | null {
      const vaultId = getFoldVault()
      if (!vaultId || !file?.path) return null
      return loadFileFolds(vaultId, file.path)
    },
    save(file: { path?: string } | null, foldInfo: { folds?: FoldedLine[]; lines?: number } | null): void {
      const vaultId = getFoldVault()
      if (!vaultId || !file?.path) return
      const folds = Array.isArray(foldInfo?.folds) ? foldInfo.folds.map(({ from, to }) => ({ from, to })) : []
      saveFileFolds(vaultId, file.path, { folds, lines: foldInfo?.lines ?? 0 })
    },
    getFolds(file: { path?: string } | null): FoldedLine[] {
      const vaultId = getFoldVault()
      return vaultId && file?.path ? loadFileFolds(vaultId, file.path)?.folds ?? [] : []
    },
  }
}

/** Deep link to a vault file (`/open?vault=…&file=…`), the Slatebase counterpart of `obsidian://open`. */
function getObsidianUrl(file: FileLike): string {
  const vaultId = getFoldVault()
  const path = pathOf(file)
  if (!vaultId) {
    warnNoOp('App', 'getObsidianUrl', 'No vault is open, so there is no link to build.')
    return ''
  }
  return buildDeepLink(window.location.origin, vaultId, path ?? undefined)
}

/** Names of the members `createAppInternals()` provides — for the `AppShim` proxy's emulated set. */
export const APP_INTERNAL_NAMES = [
  'foldManager', 'dragManager', 'nextFrame', 'onNextFrame', 'title', 'getAppTitle',
  'getObsidianUrl', 'copyObsidianUrl', 'isVimEnabled', 'debugMode',
  'getSpellcheckLanguages', 'setSpellcheckLanguages', 'getBaseFontSize', 'setBaseFontSize',
  'setAccentColor', 'updateAccentColor', 'updateFontSize', 'updateFontFamily', 'updateTheme',
  'updateInlineTitleDisplay', 'updateViewHeaderDisplay', 'updateRibbonDisplay', 'updateTabSize',
  'enableCssTransition', 'disableCssTransition',
  'importAttachments', 'importDirectory', 'fixFileLinks', 'garbleText',
  'openWithDefaultApp', 'showInFolder', 'openVaultChooser', 'relaunch', 'registerQuitHook',
  'emulateMobile', 'getWebviewPartition', 'openHelp',
] as const

/**
 * Builds the shared internal members. Returns a fresh object whose property *descriptors* are meant
 * to be copied (`Object.defineProperties`), so the `title` getter stays live.
 */
export function createAppInternals(): Record<string, unknown> {
  const internals: Record<string, unknown> = {
    foldManager: createFoldManager(),
    dragManager: createDragManager(),

    // ── Frame scheduling (utility methods) ──
    nextFrame: (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve())),
    onNextFrame: (callback: () => void): void => { requestAnimationFrame(() => callback()) },

    getAppTitle: (): string => document.title,

    // ── Links ──
    getObsidianUrl,
    copyObsidianUrl: async (file: FileLike): Promise<boolean> => {
      const url = getObsidianUrl(file)
      if (!url) return false
      try {
        await navigator.clipboard.writeText(url)
        return true
      } catch (err) {
        warnNoOp('App', 'copyObsidianUrl', `The browser refused clipboard access: ${String(err)}`)
        return false
      }
    },

    // ── Features Slatebase does not have, answered truthfully ──
    isVimEnabled: (): boolean => false,
    debugMode: (enabled?: boolean): void => {
      debugOnce('app::debugMode', `[App] debugMode(${String(enabled)}) ignored: Slatebase has no Obsidian debug mode.`)
    },

    // ── Spellcheck: Slatebase has its own (editor/spellcheck); the language list is Obsidian's OS dictionaries ──
    getSpellcheckLanguages: (): string[] => [],
    setSpellcheckLanguages: desktopOnly('setSpellcheckLanguages', 'Slatebase picks the spellcheck language per editor, not from OS dictionaries.', undefined),

    // ── Appearance. Slatebase applies appearance.json / theme changes itself, so the update* hooks have
    //    nothing left to refresh; the setters would have to persist to appearance.json, which they do not yet. ──
    getBaseFontSize: (): number => {
      const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      return Number.isFinite(size) ? size : 16
    },
    setBaseFontSize: desktopOnly('setBaseFontSize', 'Change the font size in Settings → Appearance; it is not persisted from here.', undefined),
    setAccentColor: desktopOnly('setAccentColor', 'Change the accent colour in Settings → Appearance; it is not persisted from here.', undefined),
    updateAccentColor: (): void => {},
    updateFontSize: (): void => {},
    updateFontFamily: (): void => {},
    updateTheme: (): void => {},
    updateInlineTitleDisplay: (): void => {},
    updateViewHeaderDisplay: (): void => {},
    updateRibbonDisplay: (): void => {},
    updateTabSize: (): void => {},
    enableCssTransition: (): void => {},
    disableCssTransition: (): void => {},

    // ── Import helpers behind Obsidian's attachment/import UI ──
    importAttachments: desktopOnly('importAttachments', 'Use the upload route (drag & drop / paste) instead.', undefined),
    importDirectory: desktopOnly('importDirectory', 'Use the vault import (Settings → Import) instead.', undefined),
    fixFileLinks: desktopOnly('fixFileLinks', 'Link migration runs on the server when a file is renamed or moved.', undefined),
    garbleText: (text: string): string => {
      warnNoOp('App', 'garbleText', 'Text obfuscation for screenshots is not available; the text is returned unchanged.')
      return text
    },

    // ── Desktop-only: the browser cannot do this ──
    openWithDefaultApp: desktopOnly('openWithDefaultApp', 'A web app cannot open files in a desktop application.', undefined),
    showInFolder: desktopOnly('showInFolder', 'A web app cannot reveal files in the OS file manager.', undefined),
    openVaultChooser: desktopOnly('openVaultChooser', 'Switch vaults in the File Explorer instead.', undefined),
    relaunch: desktopOnly('relaunch', 'Reload the page instead.', undefined),
    registerQuitHook: desktopOnly('registerQuitHook', 'There is no application quit in a browser.', undefined),
    emulateMobile: desktopOnly('emulateMobile', 'Slatebase follows the window width; resize the window instead.', undefined),
    getWebviewPartition: desktopOnly('getWebviewPartition', 'There is no Electron webview partition in a browser.', ''),
    openHelp: desktopOnly('openHelp', 'There is no built-in help vault window.', undefined),
  }
  Object.defineProperty(internals, 'title', {
    get: (): string => document.title,
    enumerable: true,
    configurable: true,
  })
  return internals
}
