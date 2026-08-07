import { EventSystem } from '../event-system';
import { resolveWikilinkTarget } from '../../link-resolver';
import type { DirectoryTree } from '../../../types';
import type { EventRef, IWorkspaceShim, TFile } from '../types';
import type { ViewRegistry, WorkspaceLeaf } from '../view-registry';
import { EditorShim } from '../editor-shim';
import type { IEditor } from '../editor-shim';
import { refreshPluginExtensions, getActiveEditorContainerEl, setEditorContainerMountedListener } from '../../../editor/plugin-extensions';
import { MarkdownView } from './markdown-view-shim';
import { recordGapRead, recordGapCall } from '../api-gap-registry';
import {
  registerHoverLinkSource,
  unregisterHoverLinkSource,
  requestHoverPreview,
  hoverLinkEventToRequest,
} from '../hover-link-bus';

/**
 * WorkspaceShim — Obsidian Workspace API emulation.
 *
 * Provides:
 * - `getActiveFile()`: returns the currently active TFile or null
 * - Event system: `on`, `off`, `trigger` for workspace events (file-open, active-leaf-change)
 * - `setActiveFile(file)`: external method to update the active file state
 * - `registerView(type, creator)`: register a custom view type (Calendar, Kanban, etc.)
 * - `getLeaf()` / `getRightLeaf()` / `revealLeaf()`: leaf management for plugin views
 * - `getLeavesOfType()` / `detachLeavesOfType()`: view instance queries
 * - `getActiveLeaf()` / `setActiveLeaf()` / `getUnpinnedLeaf()`: active leaf tracking
 * - `createLeafBySplit()` / `splitActiveLeaf()`: split emulation (creates new tab)
 * - ES6 Proxy for non-emulated property/method access (returns no-op with console.warn, once per property)
 *
 * @example
 * ```ts
 * const workspace = new WorkspaceShim();
 * workspace.on('file-open', (file) => console.log('Opened:', file));
 * workspace.setActiveFile(myTFile);
 * ```
 */
export class WorkspaceShim implements IWorkspaceShim {
  private events: EventSystem;
  private activeFile: TFile | null = null;
  private activeLeaf: WorkspaceLeaf | null = null;
  private fileLeaf: WorkspaceLeaf | null = null;
  private viewRegistry: ViewRegistry | null = null;
  private app: unknown = null;
  private directoryTree: DirectoryTree | null = null;
  private onOpenFile: ((filePath: string) => void) | null = null;
  private editorShim: EditorShim = new EditorShim();

  /**
   * The currently active editor, or null if no markdown file is being edited.
   * Plugins access this via `app.workspace.activeEditor?.editor`.
   */
  get activeEditor(): { editor: IEditor; file: TFile | null } | null {
    if (!this.activeFile) return null;
    return { editor: this.editorShim, file: this.activeFile };
  }

  /**
   * Whether the workspace layout is ready. In Slatebase, plugins load after
   * FCP, so the layout is always considered ready when plugins execute.
   */
  readonly layoutReady: boolean = true;

  constructor() {
    this.events = new EventSystem();
    // Re-fire the leaf/layout events once the CM6 editor actually mounts. Plugins
    // that build DOM-dependent UI off `activeLeaf.view.containerEl` (e.g. "Editing
    // Toolbar") run their first attempt during onload/onLayoutReady, before the
    // editor has mounted, so that attempt finds an empty containerEl and gives up
    // silently. Without this, they never get a second chance since our shim only
    // fires these events on an actual file/leaf change, which may not happen again.
    setEditorContainerMountedListener(() => {
      this.events.trigger('layout-change');
      if (this.activeLeaf) this.events.trigger('active-leaf-change', this.activeLeaf);
    });
  }

  /**
   * Attach a ViewRegistry instance for view management.
   * Called by the PluginProvider after constructing both the WorkspaceShim and ViewRegistry.
   */
  setViewRegistry(registry: ViewRegistry, app: unknown): void {
    this.viewRegistry = registry;
    this.app = app;
  }

  /**
   * Returns the currently active TFile when a file tab is active.
   * Returns null when no file tab is active (settings tab, graph view, no tab).
   */
  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  /**
   * Register a callback for the given workspace event.
   * Supported events: 'file-open', 'active-leaf-change'
   */
  on(event: string, callback: (...args: unknown[]) => void): EventRef {
    return this.events.on(event, callback);
  }

  /**
   * Remove a callback for the given workspace event.
   * Multiple calls with the same callback don't throw.
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    this.events.off(event, callback);
  }

  /**
   * Trigger a workspace event, dispatching to all registered callbacks.
   */
  trigger(event: string, ...args: unknown[]): void {
    // 'hover-link' is how a plugin asks for a preview. In Obsidian the core
    // "Page preview" plugin listens; here it goes to the popover. Listeners
    // still receive it, since plugins may observe each other's hover events.
    if (event === 'hover-link') {
      const request = hoverLinkEventToRequest(args[0]);
      if (request) requestHoverPreview(request);
    }
    this.events.trigger(event, ...args);
  }

  /**
   * Execute a callback when the workspace layout is ready.
   * In Slatebase, plugins load after FCP, so the layout is always ready.
   * The callback is invoked asynchronously (next microtask) to match Obsidian's behavior.
   * Both sync throws and async rejections are caught to prevent unhandled errors.
   *
   * Plugin-id tagging for createEl() calls made inside `callback` is handled
   * by the per-plugin `scopeForPlugin()` wrapper applied to `app.workspace` in
   * AppShim — not here, since this method has no way to know which plugin is
   * calling it, and by the time this deferred callback runs, any ambient
   * "currently executing plugin" tracking would already have unwound anyway.
   */
  onLayoutReady(callback: () => void): void {
    Promise.resolve().then(() => {
      try {
        const result: unknown = callback();
        // If the callback returns a Promise (async function), catch its rejection too
        if (result && typeof (result as { catch?: unknown }).catch === 'function') {
          (result as Promise<unknown>).catch((err: unknown) => {
            console.error('[WorkspaceShim] onLayoutReady async callback rejected:', err);
          });
        }
      } catch (err) {
        console.error('[WorkspaceShim] onLayoutReady callback threw:', err);
      }
    });
  }

  /**
   * Update the active file state externally.
   * Emits 'file-open' and 'active-leaf-change' events when the active file changes.
   * Also updates activeLeaf with a synthetic leaf so plugins accessing
   * workspace.activeLeaf get a valid object instead of null.
   */
  setActiveFile(file: TFile | null): void {
    const previousFile = this.activeFile;
    this.activeFile = file;

    // Update activeLeaf: reuse or create a synthetic leaf for regular file tabs
    if (file !== null) {
      if (!this.fileLeaf && this.viewRegistry && this.app) {
        this.fileLeaf = this.viewRegistry.createLeaf(this.app, 'main');
      }
      if (this.fileLeaf) {
        // Attach a minimal view-like object with the file reference.
        // containerEl is a getter (not a snapshot) because plugins may read
        // activeLeaf.view.containerEl before or after the CM6 editor mounts
        // (React effect ordering isn't guaranteed relative to this call) —
        // it must always reflect whatever editor is currently live.
        (this.fileLeaf as unknown as { view: { file: TFile | null; getViewType: () => string; getMode: () => string; readonly containerEl: HTMLElement } }).view = {
          file,
          getViewType: () => 'markdown',
          getMode: () => 'source',
          get containerEl() {
            return getActiveEditorContainerEl() ?? document.createElement('div');
          },
        };
        this.activeLeaf = this.fileLeaf;
      }
    } else if (this.fileLeaf) {
      // Real Obsidian's active leaf is (almost) never null — even with no file
      // open there's a leaf with view type "empty". Plugins rely on this (e.g.
      // Excalidraw's isUnwantedLeaf() does `e.view?.getViewType()` on the leaf
      // itself without null-checking `e`, so passing null here throws).
      (this.fileLeaf as unknown as { view: { file: TFile | null; getViewType: () => string; getMode: () => string; readonly containerEl: HTMLElement } }).view = {
        file: null,
        getViewType: () => 'empty',
        getMode: () => 'source',
        get containerEl() {
          return getActiveEditorContainerEl() ?? document.createElement('div');
        },
      };
      this.activeLeaf = this.fileLeaf;
    } else {
      // No leaf has ever been created yet (no file opened this session) —
      // there is nothing to hand plugins, so null is the only honest option.
      this.activeLeaf = null;
    }

    // Only emit events if the file actually changed
    if (previousFile !== file) {
      this.events.trigger('active-leaf-change', this.activeLeaf);
      if (file !== null) {
        this.events.trigger('file-open', file);
      }
    }
  }

  // ─── View Registration & Leaf Management ──────────────────────────────────

  /**
   * Register a custom view type with its factory function.
   * Plugins call this in onload() to register their views.
   *
   * @param viewType - Unique string identifier for the view type
   * @param creator - Factory function that creates a view instance given a leaf
   * @param pluginId - Optional plugin ID for ownership tracking
   */
  registerView(viewType: string, creator: (leaf: WorkspaceLeaf) => unknown, pluginId?: string): void {
    if (!this.viewRegistry) {
      console.warn(`[WorkspaceShim] registerView("${viewType}") called before ViewRegistry attached — no-op.`);
      return;
    }
    this.viewRegistry.registerView(viewType, creator, pluginId ?? 'unknown');
  }

  /**
   * Get or create a workspace leaf for hosting a view.
   *
   * - If `newLeaf === true`: always creates a new leaf with location 'main'.
   * - If `newLeaf` is falsy/undefined: returns an existing leaf with null view,
   *   or creates a new leaf with location 'main' if none available.
   */
  getLeaf(newLeaf?: boolean | string): WorkspaceLeaf {  
    if (!this.viewRegistry) {
      // Should not happen in practice — create a leaf anyway if registry is available later
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }

    if (newLeaf === true) {
      return this.viewRegistry.createLeaf(this.app, 'main');
    }

    // Find an existing leaf with no view (null view)
    const allLeaves = this.viewRegistry.getAllLeaves();
    const emptyLeaf = allLeaves.find(l => l.view === null);
    if (emptyLeaf) {
      return emptyLeaf;
    }

    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Get or create a leaf in the right sidebar (Context Panel).
   * Creates a leaf with location 'right-sidebar'.
   */
  getRightLeaf(_split?: boolean): WorkspaceLeaf {  
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'right-sidebar');
    }
    return this.viewRegistry.createLeaf(this.app, 'right-sidebar');
  }

  /**
   * Get or create a leaf in the left sidebar.
   * Slatebase maps both left and right sidebar to the Context Panel (right-sidebar).
   */
  getLeftLeaf(_split?: boolean): WorkspaceLeaf {  
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'right-sidebar');
    }
    return this.viewRegistry.createLeaf(this.app, 'right-sidebar');
  }

  /**
   * Returns the currently active leaf, or null if no tab is active.
   */
  getActiveLeaf(): WorkspaceLeaf | null {
    return this.activeLeaf;
  }

  /**
   * Set the given leaf as the active leaf.
   * Activates the associated tab. Warns if the leaf is unknown.
   */
  setActiveLeaf(leaf: WorkspaceLeaf): void {
    if (!this.viewRegistry) {
      console.warn('[WorkspaceShim] setActiveLeaf called before ViewRegistry attached — no-op.');
      return;
    }

    const allLeaves = this.viewRegistry.getAllLeaves();
    if (!allLeaves.includes(leaf)) {
      console.warn('[WorkspaceShim] setActiveLeaf called with unknown leaf — no-op.');
      return;
    }

    this.activeLeaf = leaf;
    this.events.trigger('active-leaf-change', leaf);
  }

  /**
   * Get an unpinned leaf. Slatebase has no pinning concept, so this always
   * creates a new leaf with location 'main'.
   */
  getUnpinnedLeaf(): WorkspaceLeaf {
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Reveal (activate/focus) a leaf.
   * For main leaves, sets it as the active leaf (triggering tab activation).
   * For sidebar leaves, sets it as the active leaf (triggering section activation).
   * Silently ignores unknown leaves.
   */
  revealLeaf(leaf: WorkspaceLeaf): void {
    if (!this.viewRegistry) return;
    const allLeaves = this.viewRegistry.getAllLeaves();
    if (!allLeaves.includes(leaf)) return;
    this.setActiveLeaf(leaf);
  }

  /**
   * Create a new leaf by splitting an existing leaf.
   * Slatebase does not support split panes — creates a new tab instead.
   */
  createLeafBySplit(_leaf: WorkspaceLeaf): WorkspaceLeaf {  
    console.info('[WorkspaceShim] createLeafBySplit: Slatebase does not support split panes — created new tab instead.');
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Split the active leaf. Slatebase does not support split panes — creates a new tab instead.
   */
  splitActiveLeaf(): WorkspaceLeaf {
    console.info('[WorkspaceShim] splitActiveLeaf: Slatebase does not support split panes — created new tab instead.');
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Get all leaves that have a view of the given type.
   */
  getLeavesOfType(viewType: string): WorkspaceLeaf[] {
    if (!this.viewRegistry) return [];
    return this.viewRegistry.getLeavesOfType(viewType);
  }

  /**
   * Get the active view if it is an instance of the given class.
   * Returns the view cast to T if the active leaf's view matches, null otherwise.
   *
   * Special case: When plugins request MarkdownView and a file is actively being edited,
   * we return a synthetic MarkdownView wrapping the EditorShim. This allows plugins like
   * Templater and Editor Toolbar to access the editor via the standard Obsidian pattern.
   *
   * The same synthetic view is also returned for `ItemView`/`FileView` — real Obsidian's
   * MarkdownView descends from both, so plugins commonly probe with a generic base class
   * (Editing Toolbar calls `getActiveViewOfType(ItemView)`, not `MarkdownView`, to also
   * cover canvas/excalidraw). Our shim classes don't share a prototype chain, so this
   * lookup is done by identity against the real `window.obsidian` globals instead.
   */
  getActiveViewOfType<T>(viewClass: new (...args: unknown[]) => T): T | null {
    if (this.activeLeaf?.view instanceof viewClass) {
      return this.activeLeaf.view as T;
    }

    const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian;
    const isMarkdownViewFamily =
      viewClass === (MarkdownView as unknown) ||
      (!!obsidian && (viewClass === obsidian.FileView || viewClass === obsidian.ItemView));

    // If requesting MarkdownView (or one of its Obsidian ancestor classes) and we
    // have an active file, create a synthetic one
    if (isMarkdownViewFamily && this.activeFile) {
      const mdView = new MarkdownView(this.editorShim, this.activeFile);
      return mdView as unknown as T;
    }

    return null;
  }

  /**
   * Iterate over all active leaves (main + sidebar), calling the callback for each.
   * Only yields leaves that have a view with a containerEl (plugins expect this).
   * If a callback throws, the error is logged and iteration continues.
   */
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
    if (!this.viewRegistry) return;
    const allLeaves = this.viewRegistry.getAllLeaves();
    for (const leaf of allLeaves) {
      if (!leaf.view || !leaf.view.containerEl) continue;
      try {
        callback(leaf);
      } catch (err) {
        console.error('[WorkspaceShim] iterateAllLeaves: callback threw for leaf:', err);
      }
    }
  }

  /**
   * Iterate over root (main area) leaves only, calling the callback for each.
   * Excludes sidebar leaves created via getRightLeaf()/getLeftLeaf().
   * If a callback throws, the error is logged and iteration continues.
   */
  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => void): void {
    if (!this.viewRegistry) return;
    const mainLeaves = this.viewRegistry.getMainLeaves();
    for (const leaf of mainLeaves) {
      try {
        callback(leaf);
      } catch (err) {
        console.error('[WorkspaceShim] iterateRootLeaves: callback threw for leaf:', err);
      }
    }
  }

  /**
   * Detach (close) all leaves of the given view type.
   * Emits `layout-change` after leaves are detached.
   */
  detachLeavesOfType(viewType: string): void {
    if (!this.viewRegistry) return;
    void this.viewRegistry.detachLeavesOfType(viewType);
    this.events.trigger('layout-change');
  }

  /**
   * Get the ViewRegistry instance (for external access by PluginProvider).
   */
  getViewRegistry(): ViewRegistry | null {
    return this.viewRegistry;
  }

  /**
   * Set the active leaf internally (called by the event bridge when tab changes).
   * Does not emit events — used for synchronizing state from external tab changes.
   */
  setActiveLeafInternal(leaf: WorkspaceLeaf | null): void {
    this.activeLeaf = leaf;
  }

  // ─── Link Navigation ──────────────────────────────────────────────────────────

  /**
   * Set the vault's directory tree for link resolution.
   * Called by the PluginProvider when the tree changes.
   */
  setDirectoryTree(tree: DirectoryTree | null): void {
    this.directoryTree = tree;
  }

  /**
   * Set the callback for opening a file by path.
   * Called by the PluginProvider to wire to tabActions/OPEN_TAB.
   */
  setOnOpenFile(callback: ((filePath: string) => void) | null): void {
    this.onOpenFile = callback;
  }

  /**
   * Set the textarea element for the editor shim.
   * Called by the PluginEventBridge when the active editor textarea changes.
   */
  setEditorTextarea(textarea: HTMLTextAreaElement | null): void {
    this.editorShim.setTextarea(textarea);
  }

  /**
   * Open a file directly by its exact path (no wikilink resolution).
   * Used by WorkspaceLeaf.openFile() for newly created files that may not
   * yet be in the directory tree.
   */
  openFileDirectly(filePath: string): void {
    if (!filePath) return;
    if (this.onOpenFile) {
      this.onOpenFile(filePath);
    }
  }

  /**
   * Open a link by resolving the linkText against the vault's directory tree.
   *
   * - No-op for empty linkText (Req 8.4)
   * - Uses resolveWikilinkTarget for resolution (case-insensitive, .md fallback)
   * - If resolved, dispatches tab open via the onOpenFile callback
   * - If not resolved, logs a console.warn and takes no action (Req 8.3)
   *
   * @param linkText - The wikilink target string to resolve
   * @param _sourcePath - The source file path (unused, reserved for future relative resolution)
   */
  async openLinkText(linkText: string, _sourcePath: string): Promise<void> {  
    // Req 8.4: No-op for empty linkText
    if (!linkText || !linkText.trim()) return;

    // Resolve using the wikilink resolver
    const resolved = resolveWikilinkTarget(linkText, this.directoryTree);
    if (!resolved) {
      // Req 8.3: Not resolved → warn and no action
      console.warn(
        `[WorkspaceShim] openLinkText: could not resolve "${linkText}" — no matching file in vault.`
      );
      return;
    }

    // Open the resolved file as a tab
    if (this.onOpenFile) {
      this.onOpenFile(resolved);
    }
  }

  /**
   * Remove all event listeners. Used during cleanup/deactivation.
   */
  removeAllListeners(): void {
    this.events.removeAllListeners();
  }

  /**
   * The workspace container element.
   * Plugins may append DOM elements here (e.g. LiveSync status div).
   * We use a hidden, off-screen container so plugin DOM operations
   * don't affect the visible layout of the Slatebase UI.
   * Includes stub child elements that plugins expect to find via querySelector.
   */
  readonly containerEl: HTMLElement = (() => {
    const el = document.createElement('div')
    el.className = 'workspace-plugin-container'
    el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;'
    // LiveSync and other plugins look for .status-bar to position their status icons
    const statusBar = document.createElement('div')
    statusBar.className = 'status-bar'
    el.appendChild(statusBar)
    // Some plugins look for .workspace-split or .mod-root
    const workspaceSplit = document.createElement('div')
    workspaceSplit.className = 'workspace-split mod-root'
    el.appendChild(workspaceSplit)
    document.body.appendChild(el)
    // Also ensure a .status-bar exists at document.body level for plugins
    // that search globally via document.querySelector('.status-bar')
    if (!document.querySelector('body > .status-bar')) {
      const globalStatusBar = document.createElement('div')
      globalStatusBar.className = 'status-bar'
      globalStatusBar.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;'
      document.body.appendChild(globalStatusBar)
    }
    return el
  })();

  /**
   * Get the most recently active leaf in the workspace.
   * Used by LiveSync for getting the active editing context.
   */
  getMostRecentLeaf(): WorkspaceLeaf | null {
    return this.activeLeaf;
  }

  /**
   * Update/reconfigure options for all Markdown views.
   * Triggers re-evaluation of plugin CM6 extensions — plugins like Dataview
   * fill their extension arrays after registration and call this to apply them.
   */
  updateOptions(): void {
    console.log('[WorkspaceShim] updateOptions() called → refreshPluginExtensions()')
    refreshPluginExtensions()
  }

  /**
   * Get the filenames of the most recently opened files.
   */
  getLastOpenFiles(): string[] {
    // Return empty — Slatebase doesn't track this in the workspace shim
    return [];
  }

  /**
   * Request saving the workspace layout. No-op in Slatebase (no persistent layout).
   * Kanban calls this when view settings change.
   */
  requestSaveLayout(): void {
    // No-op — Slatebase does not persist workspace layout
  }

  /**
   * viewStateReceivers — Array of callbacks that receive view state updates.
   * Kanban registers/removes itself during load/unload.
   * Obsidian extends Array with a `.remove()` helper; we stub it as a no-op array.
   */
  readonly viewStateReceivers: unknown[] & { remove: (item: unknown) => void } =
    Object.assign([] as unknown[], { remove: (_item: unknown) => {} });

  /**
   * editorSuggest — Manager for registered EditorSuggest instances.
   * Kanban accesses this during suggest registration.
   */
  readonly editorSuggest = {
    suggests: [] as unknown[],
    removeSuggest: (_suggest: unknown) => {},
  }

  /**
   * Declare that a plugin's views can produce hover previews.
   *
   * As in Obsidian this only registers the source; the preview itself appears
   * when the plugin triggers a `hover-link` event, which `trigger()` below
   * forwards to the popover.
   */
  registerHoverLinkSource(key: string, source: unknown): void {
    const info = typeof source === 'object' && source !== null
      ? (source as { display?: string })
      : undefined;
    registerHoverLinkSource(key, info);
  }

  /** Withdraw a previously declared hover link source. */
  unregisterHoverLinkSource(key: string): void {
    unregisterHoverLinkSource(key);
  }

  /**
   * Remove an event reference. No-op in Slatebase.
   */
  offref(_ref: unknown): void {
    // No-op — event refs are cleaned up on unload
  }

  /**
   * Workspace splits — stub objects for plugins that access layout structure.
   */
  readonly rootSplit = { type: 'split', children: [] };
  readonly leftSplit = { type: 'split', collapsed: false, toggle() {}, collapse() {}, expand() {} };
  readonly rightSplit = { type: 'split', collapsed: false, toggle() {}, collapse() {}, expand() {} };

  /**
   * Open a popout window leaf. Returns the active leaf (no popout support in web).
   */
  openPopoutLeaf(): WorkspaceLeaf | null {
    // Web app cannot open popout windows — return active leaf as fallback
    return this.activeLeaf;
  }

  /**
   * Get the current workspace layout. Returns minimal stub.
   */
  getLayout(): Record<string, unknown> {
    return { main: { type: 'split', children: [] } };
  }

  /**
   * Retrieve a leaf by its ID. Returns null (no persistent leaf IDs in Slatebase).
   */
  getLeafById(_id: string): WorkspaceLeaf | null {
    return null;
  }

  /**
   * Create a leaf in a parent split at a given index. Returns a new leaf.
   */
  createLeafInParent(_parent: unknown, _index: number): WorkspaceLeaf {
    // Delegate to getLeaf — no real split management in Slatebase
    return this.getLeaf(true);
  }

  /**
   * Creates a Proxy-wrapped instance that intercepts access to non-emulated properties/methods.
   * Non-emulated accesses return a no-op function and log a console.warn (once per property name).
   */
  static createProxied(): WorkspaceShim & Record<string, unknown> {
    const instance = new WorkspaceShim();
    return WorkspaceShim.wrapWithProxy(instance);
  }

  /**
   * Wraps an existing WorkspaceShim instance with a Proxy for non-emulated API interception.
   */
  static wrapWithProxy(instance: WorkspaceShim): WorkspaceShim & Record<string, unknown> {
    const emulatedProperties = new Set<string | symbol>([
      'getActiveFile',
      'on',
      'off',
      'trigger',
      'setActiveFile',
      'removeAllListeners',
      'setViewRegistry',
      'registerView',
      'getLeaf',
      'getRightLeaf',
      'getLeftLeaf',
      'getActiveLeaf',
      'setActiveLeaf',
      'getUnpinnedLeaf',
      'revealLeaf',
      'createLeafBySplit',
      'splitActiveLeaf',
      'getLeavesOfType',
      'getActiveViewOfType',
      'iterateAllLeaves',
      'iterateRootLeaves',
      'detachLeavesOfType',
      'getViewRegistry',
      'setActiveLeafInternal',
      'setDirectoryTree',
      'setOnOpenFile',
      'setEditorTextarea',
      'activeEditor',
      'openLinkText',
      'onLayoutReady',
      'layoutReady',
      'requestSaveLayout',
      'registerHoverLinkSource',
      'unregisterHoverLinkSource',
      'floatingSplit',
      'viewStateReceivers',
      'editorSuggest',
      'containerEl',
      'getMostRecentLeaf',
      'updateOptions',
      'getLastOpenFiles',
      'offref',
      'rootSplit',
      'leftSplit',
      'rightSplit',
      'openPopoutLeaf',
      'getLayout',
      'getLeafById',
      'createLeafInParent',
      // Internal properties that should not trigger warnings
      'events',
      'activeFile',
      'activeLeaf',
      'fileLeaf',
      'viewRegistry',
      'app',
      'directoryTree',
      'onOpenFile',
    ]);

    return new Proxy(instance, {
      get(target: WorkspaceShim, prop: string | symbol, receiver: unknown): unknown {
        // Allow access to emulated properties directly
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        // Allow symbol properties (iterator, toStringTag, etc.) and standard object properties
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }

        // Non-emulated property: record the gap and warn once. The workspace is
        // shared across plugins, so these accesses cannot be attributed to one.
        if (recordGapRead('Workspace', prop)) {
          console.warn(
            `[WorkspaceShim] Access to non-emulated workspace method/property "${prop}". ` +
            `Slatebase returns a no-op function here, which is truthy — feature ` +
            `detection like \`if (workspace.${prop})\` will take the wrong branch. ` +
            `Inspect all gaps with window.__slatebasePluginApiGaps().`
          );
        }

        // Return a callable no-op. Invoking it means a plugin actually depended
        // on the API, which is recorded separately from the read.
        // Invocation is recorded but not warned again — the read already warned
        // once, and the call count is queryable via the registry.
        return () => {
          recordGapCall('Workspace', prop);
          return undefined;
        };
      },
    }) as WorkspaceShim & Record<string, unknown>;
  }
}
