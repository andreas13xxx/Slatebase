/**
 * Obsidian view types that Slatebase renders itself, not through a plugin.
 *
 * Obsidian registers every view (`markdown`, `canvas`, `bases`, `outline`, ...) under a type
 * name, and plugins switch a leaf with `leaf.setViewState({ type, state })`. Slatebase has
 * plugin views in its `ViewRegistry`; its own views are tabs (picked by file extension) and
 * side panels. This table is the one place that links the two worlds:
 *
 * - a `file` view is a tab: its extensions give the type of an open file (`viewTypeForTab`),
 *   and `state.file` opens it when a plugin asks for the type;
 * - a `command` view is a panel or page opened by a core command.
 *
 * A type that is in neither this table nor the plugin registry is a real gap and stays a warning.
 *
 * @module native-views
 */

import { requestBasesView } from '../../state/basesViewBridge'
import { requestViewTab } from '../../state/viewTabBridge'

/** A view that is a tab, chosen by file extension. */
interface NativeFileView {
  kind: 'file'
  extensions: readonly string[]
}

/** A view that is a panel or page, opened by running a core command. */
interface NativeCommandView {
  kind: 'command'
  commandId: string
}

/** A view that is a Slatebase tab without a file of its own (an empty tab, the recovery view). */
interface NativeTabView {
  kind: 'tab'
  tab: 'empty' | 'file-recovery'
}

type NativeView = NativeFileView | NativeCommandView | NativeTabView

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'] as const
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm'] as const
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'ogv'] as const

/**
 * Native view types by Obsidian name. `outgoing-link` shares the Links panel with `backlink`
 * (Slatebase shows both in one view); `localgraph` needs the active note; `all-properties` and
 * `file-properties` share the Properties panel; `webviewer` asks for the URL (`state.url` is not used
 * yet); `file-recovery` opens the version browser as a tab (the `file-recovery:open` command is the dialog).
 */
export const NATIVE_VIEWS: Readonly<Record<string, NativeView>> = {
  markdown: { kind: 'file', extensions: ['md'] },
  canvas: { kind: 'file', extensions: ['canvas'] },
  bases: { kind: 'file', extensions: ['base'] },
  pdf: { kind: 'file', extensions: ['pdf'] },
  image: { kind: 'file', extensions: IMAGE_EXTENSIONS },
  audio: { kind: 'file', extensions: AUDIO_EXTENSIONS },
  video: { kind: 'file', extensions: VIDEO_EXTENSIONS },
  graph: { kind: 'command', commandId: 'graph:open' },
  localgraph: { kind: 'command', commandId: 'graph:open-local' },
  outline: { kind: 'command', commandId: 'outline:open' },
  backlink: { kind: 'command', commandId: 'backlink:open' },
  'outgoing-link': { kind: 'command', commandId: 'backlink:open' },
  search: { kind: 'command', commandId: 'global-search:open' },
  tag: { kind: 'command', commandId: 'tag-pane:open' },
  bookmarks: { kind: 'command', commandId: 'bookmarks:open' },
  'file-explorer': { kind: 'command', commandId: 'file-explorer:open' },
  'all-properties': { kind: 'command', commandId: 'properties:open' },
  'file-properties': { kind: 'command', commandId: 'properties:open-local' },
  footnotes: { kind: 'command', commandId: 'footnotes:open' },
  webviewer: { kind: 'command', commandId: 'webviewer:open' },
  empty: { kind: 'tab', tab: 'empty' },
  'file-recovery': { kind: 'tab', tab: 'file-recovery' },
}

/** View type of a file extension, or `null` when no native file view claims it. */
export function nativeViewTypeForExtension(extension: string): string | null {
  const ext = extension.toLowerCase()
  for (const [type, view] of Object.entries(NATIVE_VIEWS)) {
    if (view.kind === 'file' && view.extensions.includes(ext)) return type
  }
  return null
}

/** Whether Slatebase renders this view type itself. */
export function isNativeViewType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(NATIVE_VIEWS, type)
}

/** What `openNativeView` needs from the workspace; keeps this module free of the shim classes. */
export interface NativeViewHost {
  openFile(filePath: string): void
  executeCommand(commandId: string): boolean
}

/**
 * Open a native view the way `leaf.setViewState({ type, state })` asks for it.
 *
 * @returns `false` when the type is not native, or when it needs a file and `state.file` is missing
 *          (the caller then reports the gap); `true` when the view was opened.
 */
export function openNativeView(type: string, state: Record<string, unknown> | undefined, host: NativeViewHost): boolean {
  if (!isNativeViewType(type)) return false
  const view = NATIVE_VIEWS[type]
  if (!view) return false

  if (view.kind === 'command') return host.executeCommand(view.commandId)

  if (view.kind === 'tab') {
    const file = typeof state?.file === 'string' ? state.file : undefined
    return requestViewTab(file === undefined ? { type: view.tab } : { type: view.tab, file })
  }

  const file = typeof state?.file === 'string' ? state.file : null
  if (!file) return false
  // Before the tab opens: the Bases view reads the request when it mounts.
  if (type === 'bases' && typeof state?.viewName === 'string') requestBasesView(file, state.viewName)
  host.openFile(file)
  return true
}
