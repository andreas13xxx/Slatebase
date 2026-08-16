import { EventSystem } from '../event-system';
import { debugOnce, warnOnce } from '../log';
import { resolveWikilinkTarget } from '../../link-resolver';
import type { DirectoryTree } from '../../../types';
import type { EventRef, IWorkspaceShim, TFile } from '../types';
import type { ViewRegistry, WorkspaceLeaf } from '../view-registry';
import { EditorShim } from '../editor-shim';
import type { IEditor } from '../editor-shim';
import { refreshPluginExtensions, getActiveEditorContainerEl, setEditorContainerMountedListener } from '../../../editor/plugin-extensions';
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
/**
 * Shape of the synthetic `view` object attached to the shared fileLeaf, used
 * both for regular file tabs (setActiveFile) and the "empty" fallback
 * (getOrCreateEmptyLeaf). Covers the View surface real plugins call on
 * whatever leaf happens to be active, without necessarily checking it first.
 */
/**
 * Builds a placeholder container carrying the `.markdown-source-view` marker
 * that plugins query for an editor insertion point (e.g. "Editing Toolbar"
 * builds its floating selection toolbar off
 * `containerEl.querySelector('.markdown-source-view')`), for use before the
 * real CM6 editor has mounted.
 *
 * Real Obsidian's leaf DOM skeleton — including that marker — exists
 * synchronously, before the CM6 instance inside it finishes initializing.
 * Without this, `querySelector('.markdown-source-view')` returns null during
 * a plugin's synchronous onload()/onLayoutReady() init. Plugins treat that as
 * "nothing to attach to yet" and skip their own setup, but never get a signal
 * to retry once the real editor mounts — leaving a field like a cached
 * toolbar element permanently unset and throwing the next time selection
 * handling reads it.
 */
function createMarkdownSourceViewPlaceholder(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'plugin-view-container';
  const marker = document.createElement('div');
  marker.className = 'markdown-source-view mod-cm6';
  container.appendChild(marker);
  return container;
}

interface SyntheticFileLeafView {
  view: {
    file: TFile | null;
    getViewType: () => string;
    getMode: () => string;
    getDisplayText: () => string;
    getIcon: () => string;
    getState: () => Record<string, unknown>;
    setState: () => Promise<void>;
    getEphemeralState: () => Record<string, unknown>;
    setEphemeralState: () => void;
    readonly containerEl: HTMLElement;
  };
}

export class WorkspaceShim implements IWorkspaceShim {
  private events: EventSystem;
  private activeFile: TFile | null = null;
  private activeLeaf: WorkspaceLeaf | null = null;
  private fileLeaf: WorkspaceLeaf | null = null;
  /**
   * The most recently active leaf in the MAIN area specifically — distinct from
   * `activeLeaf`, which also tracks sidebar leaves (e.g. a plugin's own toolbar
   * panel in the Context Panel). Real Obsidian's `getMostRecentLeaf()` defaults
   * to `root = this.rootSplit`, deliberately excluding sidebar leaves, so that
   * a sidebar panel (Advanced Tables' table-controls toolbar, for one) can look
   * up "the editor I should act on" even while the user's focus/click is inside
   * the sidebar itself. Sharing a single field with `activeLeaf` broke exactly
   * that: revealing the sidebar leaf overwrote it, and the toolbar's own
   * `instanceof MarkdownView` check against the wrong leaf failed.
   */
  private mostRecentMainLeaf: WorkspaceLeaf | null = null;
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
    debugOnce(
      'WorkspaceShim.protocolHandlers',
      '[WorkspaceShim] protocolHandlers/protocolHandler: Slatebase is a web app and cannot receive obsidian:// links — registered handlers are stored but never invoked.'
    );
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
  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): EventRef {
    return this.events.on(event, callback, context);
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
   * In Slatebase, plugins load after FCP, so the layout is always ready — per
   * Obsidian's documented semantics ("called when the layout is ready, or
   * immediately if the layout is already ready"), the callback therefore runs
   * synchronously, in the same tick as the call. Deferring it (e.g. to a
   * microtask) would open a timing gap real Obsidian doesn't have: plugins
   * that build DOM off a container captured just before the call can find it
   * replaced/removed by the time a deferred callback finally runs, since
   * unrelated app work (React re-renders, other plugins loading) gets a
   * chance to run in between.
   * Both sync throws and async rejections are caught to prevent unhandled errors.
   *
   * Plugin-id tagging for createEl() calls made inside `callback` is handled
   * by the per-plugin `scopeForPlugin()` wrapper applied to `app.workspace` in
   * AppShim — not here, since this method has no way to know which plugin is
   * calling it.
   */
  onLayoutReady(callback: () => void): void {
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
        // Memoized per view instance so repeated pre-mount reads return the
        // same placeholder rather than a fresh detached div each time.
        let containerElFallback: HTMLElement | null = null;
        // Attach a minimal view-like object with the file reference.
        // containerEl is a getter (not a snapshot) because plugins may read
        // activeLeaf.view.containerEl before or after the CM6 editor mounts
        // (React effect ordering isn't guaranteed relative to this call) —
        // it must always reflect whatever editor is currently live.
        (this.fileLeaf as unknown as SyntheticFileLeafView).view = {
          file,
          getViewType: () => 'markdown',
          getMode: () => 'source',
          // Real Obsidian's MarkdownView always implements this View surface —
          // plugins routinely call these off the active leaf without checking
          // they're implemented first (obsidian-git's active-leaf-change handler
          // and Mind Map's activeLeafPath/activeLeafName both do, for getState()
          // and getDisplayText() respectively). Implementing the whole small
          // surface at once avoids fixing this one method at a time.
          getDisplayText: () => file?.basename ?? file?.name ?? 'Untitled',
          getIcon: () => 'document',
          getState: () => ({ file: file?.path ?? null, mode: 'source', source: true }),
          setState: async () => {},
          getEphemeralState: () => ({}),
          setEphemeralState: () => {},
          get containerEl() {
            return getActiveEditorContainerEl() ?? (containerElFallback ??= createMarkdownSourceViewPlaceholder());
          },
        };
        this.activeLeaf = this.fileLeaf;
        this.mostRecentMainLeaf = this.fileLeaf;
      }
    } else {
      // Real Obsidian's active leaf is (almost) never null — even with no file
      // open there's a leaf with view type "empty". getOrCreateEmptyLeaf()
      // returns null only when there's truly no leaf infrastructure available
      // (no ViewRegistry/app attached) to hand plugins anything.
      this.activeLeaf = this.getOrCreateEmptyLeaf();
      this.mostRecentMainLeaf = this.activeLeaf;
    }

    // Only emit events if the file actually changed
    if (previousFile !== file) {
      this.events.trigger('active-leaf-change', this.activeLeaf);
      if (file !== null) {
        this.events.trigger('file-open', file);
      }
    }
  }

  /**
   * Return a leaf with an "empty" view (creating the shared fallback leaf on
   * demand if none exists yet), or null if there's no ViewRegistry/app to
   * create one with.
   *
   * Real Obsidian's active leaf is (almost) never null — plugins routinely
   * dereference `leaf.view` without checking `leaf` itself (Excalidraw's
   * `isUnwantedLeaf()`/`onActiveLeafChangeHandler` both do), so anywhere we'd
   * otherwise hand a plugin a bare `null` leaf, this should be used instead.
   */
  getOrCreateEmptyLeaf(): WorkspaceLeaf | null {
    if (!this.fileLeaf) {
      if (!this.viewRegistry || !this.app) return null;
      this.fileLeaf = this.viewRegistry.createLeaf(this.app, 'main');
    }
    let emptyContainerElFallback: HTMLElement | null = null;
    (this.fileLeaf as unknown as SyntheticFileLeafView).view = {
      file: null,
      getViewType: () => 'empty',
      getMode: () => 'source',
      getDisplayText: () => 'New tab',
      getIcon: () => 'file',
      getState: () => ({ file: null }),
      setState: async () => {},
      getEphemeralState: () => ({}),
      setEphemeralState: () => {},
      get containerEl() {
        return getActiveEditorContainerEl() ?? (emptyContainerElFallback ??= createMarkdownSourceViewPlaceholder());
      },
    };
    return this.fileLeaf;
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
      warnOnce(
        `WorkspaceShim.registerView.notAttached::${viewType}`,
        `[WorkspaceShim] registerView("${viewType}") called before ViewRegistry attached — no-op.`,
      );
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
   * Get-or-create a leaf of the given view type in a sidebar (Obsidian API
   * since 1.7.2) — the public shorthand for the get-existing-or-create-new
   * pattern plugins previously had to write by hand against
   * `getLeavesOfType()` + `getRightLeaf()`/`getLeftLeaf()`.
   *
   * Slatebase maps both sidebar sides onto the single Context Panel
   * (`right-sidebar` location — see `getLeftLeaf()`), so `side` only chooses
   * which factory creates a *new* leaf; an existing leaf of the type is
   * reused regardless of which side it was originally opened on.
   */
  async ensureSideLeaf(
    viewType: string,
    side: 'left' | 'right',
    options?: { active?: boolean; reveal?: boolean; split?: boolean; state?: Record<string, unknown> },
  ): Promise<WorkspaceLeaf> {
    debugOnce('WorkspaceShim.ensureSideLeaf', '[WorkspaceShim] ensureSideLeaf: Slatebase maps both sidebar sides onto the single Context Panel.');
    const existing = this.getLeavesOfType(viewType).find(l => l.location === 'right-sidebar');
    if (existing) {
      if (options?.reveal !== false) this.revealLeaf(existing);
      return existing;
    }

    const leaf = side === 'left' ? this.getLeftLeaf(options?.split) : this.getRightLeaf(options?.split);
    await leaf.setViewState({ type: viewType, active: options?.active, state: options?.state });
    if (options?.reveal !== false) this.revealLeaf(leaf);
    return leaf;
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
      warnOnce('WorkspaceShim.setActiveLeaf.notAttached', '[WorkspaceShim] setActiveLeaf called before ViewRegistry attached — no-op.');
      return;
    }

    const allLeaves = this.viewRegistry.getAllLeaves();
    if (!allLeaves.includes(leaf)) {
      warnOnce('WorkspaceShim.setActiveLeaf.unknownLeaf', '[WorkspaceShim] setActiveLeaf called with unknown leaf — no-op.');
      return;
    }

    this.activeLeaf = leaf;
    // Sidebar leaves (e.g. a plugin revealing its own Context Panel toolbar)
    // must not steal "most recent main leaf" status — see the field doc comment.
    if (leaf.location === 'main') {
      this.mostRecentMainLeaf = leaf;
    }
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
    debugOnce('WorkspaceShim.createLeafBySplit', '[WorkspaceShim] createLeafBySplit: Slatebase does not support split panes — created new tab instead.');
    if (!this.viewRegistry) {
      return this.viewRegistry!.createLeaf(this.app, 'main');
    }
    return this.viewRegistry.createLeaf(this.app, 'main');
  }

  /**
   * Split the active leaf. Slatebase does not support split panes — creates a new tab instead.
   */
  splitActiveLeaf(): WorkspaceLeaf {
    debugOnce('WorkspaceShim.splitActiveLeaf', '[WorkspaceShim] splitActiveLeaf: Slatebase does not support split panes — created new tab instead.');
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
   * we build one by constructing the REAL `window.obsidian.MarkdownView` (the
   * Component -> View -> ItemView -> FileView -> MarkdownView chain from
   * install-globals.ts) against the shared fileLeaf, so the result is a genuine
   * `instanceof MarkdownView` with working registerEvent/registerDomEvent/addChild —
   * not a disconnected lookalike. This allows plugins like Templater and Editor
   * Toolbar to access the editor via the standard Obsidian pattern.
   *
   * The same view is also returned for `ItemView`/`FileView` — real Obsidian's
   * MarkdownView descends from both, so plugins commonly probe with a generic base
   * class (Editing Toolbar calls `getActiveViewOfType(ItemView)`, not `MarkdownView`,
   * to also cover canvas/excalidraw).
   */
  getActiveViewOfType<T>(viewClass: new (...args: unknown[]) => T): T | null {
    if (this.activeLeaf?.view instanceof viewClass) {
      return this.activeLeaf.view as T;
    }

    const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian;
    const MarkdownViewClass = obsidian?.MarkdownView as (new (leaf: unknown) => object) | undefined;
    const isMarkdownViewFamily =
      !!MarkdownViewClass &&
      (viewClass === (MarkdownViewClass as unknown) || viewClass === obsidian?.FileView || viewClass === obsidian?.ItemView);

    // If requesting MarkdownView (or one of its Obsidian ancestor classes) and we
    // have an active file and a leaf to build it against, construct one.
    if (isMarkdownViewFamily) {
      const mdView = this.buildMarkdownView();
      if (mdView) return mdView as unknown as T;
    }

    return null;
  }

  /**
   * Builds a fresh `window.obsidian.MarkdownView` instance (the real
   * Component -> View -> ItemView -> FileView -> MarkdownView chain from
   * install-globals.ts) bound to the shared `fileLeaf`, reflecting whatever
   * file/editor is currently active. Returns null if there's no active file,
   * no fileLeaf, or the MarkdownView class hasn't been installed yet.
   *
   * Built fresh on every call — like `getActiveViewOfType`'s containerEl
   * snapshot below, this must stay accurate whether or not the CM6 editor
   * has mounted yet, so nothing here is cached across calls.
   */
  private buildMarkdownView(): unknown | null {
    const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian;
    const MarkdownViewClass = obsidian?.MarkdownView as (new (leaf: unknown) => object) | undefined;
    if (!MarkdownViewClass || !this.activeFile || !this.fileLeaf) return null;

    const mdView = new MarkdownViewClass(this.fileLeaf) as unknown as { file: TFile | null; containerEl: HTMLElement; contentEl?: HTMLElement };
    mdView.file = this.activeFile;
    const liveContainer = getActiveEditorContainerEl();
    if (liveContainer) {
      // Snapshot the live editor container — fresh per call, so this stays
      // accurate whether or not the CM6 editor has mounted yet.
      mdView.containerEl = liveContainer;
    } else if (mdView.contentEl) {
      // No real editor mounted yet. Real Obsidian's leaf DOM skeleton — including
      // the `.markdown-source-view` marker plugins query for an insertion point
      // (e.g. "Editing Toolbar" builds its floating selection toolbar off
      // `containerEl.querySelector('.markdown-source-view')`) — exists
      // synchronously, before the CM6 instance inside it finishes initializing.
      // Without this, that query returns null during a plugin's synchronous
      // onload()/onLayoutReady() init. Plugins treat that as "nothing to attach
      // to yet" and skip their setup, but — unlike the active-leaf-change/
      // layout-change re-fire below — never get a signal to retry once the real
      // editor mounts, leaving a field like a cached toolbar element permanently
      // unset and throwing the next time selection handling reads it.
      const placeholder = document.createElement('div');
      placeholder.className = 'markdown-source-view mod-cm6';
      mdView.contentEl.appendChild(placeholder);
    }
    return mdView;
  }

  /**
   * Returns the active leaf's view if it is a FileView, or null.
   *
   * Undocumented internal Obsidian API — several plugins call it as a shortcut
   * for `getActiveViewOfType(FileView)` instead of importing FileView themselves.
   */
  getActiveFileView(): unknown {
    const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian;
    const FileViewClass = obsidian?.FileView as (new (...args: unknown[]) => object) | undefined;
    if (!FileViewClass) return null;
    return this.getActiveViewOfType(FileViewClass);
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
   * Iterate over legacy CM5 editor instances. Slatebase's editor is CM6-only —
   * there is no CM5 instance to hand back, so the callback is never invoked.
   */
  iterateCodeMirrors(_callback: (cm: unknown) => void): void {
    debugOnce('WorkspaceShim.iterateCodeMirrors', '[WorkspaceShim] iterateCodeMirrors: Slatebase has no legacy CM5 editor instances — callback not invoked.');
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
   *
   * Only ever called for the main tab bar (file tabs and main-area plugin view
   * tabs — see plugin-event-bridge.ts), never for Context Panel/sidebar leaves,
   * so it's always safe to update mostRecentMainLeaf alongside activeLeaf here.
   */
  setActiveLeafInternal(leaf: WorkspaceLeaf | null): void {
    this.activeLeaf = leaf;
    this.mostRecentMainLeaf = leaf;
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
      warnOnce(
        `WorkspaceShim.openLinkText.unresolved::${linkText}`,
        `[WorkspaceShim] openLinkText: could not resolve "${linkText}" — no matching file in vault.`,
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
   * Get the most recently active leaf in the MAIN area (mirrors real Obsidian's
   * `getMostRecentLeaf(root = this.rootSplit)`, which explicitly excludes
   * sidebar leaves). Used by LiveSync for getting the active editing context,
   * and by plugins with their own sidebar toolbar (Advanced Tables) to find
   * "the editor to act on" even while the click that triggered them happened
   * inside the sidebar — see the `mostRecentMainLeaf` field doc comment.
   *
   * When that leaf is the native file editor, its `.view` is rebuilt as a real
   * `MarkdownView` instance on every call (not the plain duck-typed object
   * `setActiveFile` stores there) so `instanceof MarkdownView` checks succeed —
   * the same construction `getActiveViewOfType(MarkdownView)` uses.
   */
  getMostRecentLeaf(): WorkspaceLeaf | null {
    const leaf = this.mostRecentMainLeaf ?? this.activeLeaf;
    if (leaf && leaf === this.fileLeaf) {
      const mdView = this.buildMarkdownView();
      if (mdView) {
        (leaf as unknown as { view: unknown }).view = mdView;
      }
    }
    return leaf;
  }

  /**
   * Update/reconfigure options for all Markdown views.
   * Triggers re-evaluation of plugin CM6 extensions — plugins like Dataview
   * fill their extension arrays after registration and call this to apply them.
   */
  updateOptions(): void {
    refreshPluginExtensions()
  }

  /**
   * Get the filenames of the most recently opened files.
   */
  getLastOpenFiles(): string[] {
    debugOnce('WorkspaceShim.getLastOpenFiles', '[WorkspaceShim] getLastOpenFiles: Slatebase does not track recently opened files — returning an empty list.');
    return [];
  }

  /**
   * Request saving the workspace layout. No-op in Slatebase (no persistent layout).
   * Kanban calls this when view settings change.
   */
  requestSaveLayout(): void {
    debugOnce('WorkspaceShim.requestSaveLayout', '[WorkspaceShim] requestSaveLayout: Slatebase does not persist workspace layout — no-op.');
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
  private readonly _editorSuggest = {
    suggests: [] as unknown[],
    removeSuggest: (_suggest: unknown) => {},
  }

  get editorSuggest(): { suggests: unknown[]; removeSuggest: (suggest: unknown) => void } {
    debugOnce('WorkspaceShim.editorSuggest', '[WorkspaceShim] editorSuggest: Slatebase does not run the built-in suggest manager — registered suggesters are tracked but not driven by Slatebase.');
    return this._editorSuggest;
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
   * Remove a listener by the ref `on()` returned.
   *
   * This used to be a no-op on the assumption that unload cleans everything up.
   * It doesn't cover the case plugins actually use `offref` for: unsubscribing
   * while still loaded (a view closing, a feature toggled off in settings). The
   * listener kept firing for the rest of the session.
   */
  offref(ref: EventRef): void {
    this.events.offref(ref);
  }

  /**
   * Workspace splits — stub objects for plugins that access layout structure.
   */
  readonly rootSplit = { type: 'split', children: [] };
  readonly leftSplit = { type: 'split', collapsed: false, toggle() {}, collapse() {}, expand() {} };
  readonly rightSplit = { type: 'split', collapsed: false, toggle() {}, collapse() {}, expand() {} };

  /**
   * `obsidian://` protocol-handler registry. Slatebase is a web app and cannot
   * receive OS-level obsidian:// links, so nothing ever invokes handlers stored
   * here — these are present as real, writable containers so plugins that read
   * or write them directly (bypassing `registerObsidianProtocolHandler`) don't
   * crash.
   */
  readonly protocolHandlers = new Map<string, (params: Record<string, string>) => unknown>();
  protocolHandler: ((params: Record<string, string>) => unknown) | null = null;

  /**
   * Ribbon (the vertical icon bar) stubs — Slatebase has no ribbon UI, so hide/show/toggle
   * are no-ops. Exists so plugins calling `workspace.leftRibbon.hide()` (e.g. Editing
   * Toolbar's "Workplace Fullscreen" command) don't crash on `undefined.hide()`.
   */
  readonly leftRibbon = {
    hide: () => debugOnce('WorkspaceShim.leftRibbon', '[WorkspaceShim] leftRibbon: Slatebase has no ribbon UI — hide/show/toggle are no-ops.'),
    show: () => debugOnce('WorkspaceShim.leftRibbon', '[WorkspaceShim] leftRibbon: Slatebase has no ribbon UI — hide/show/toggle are no-ops.'),
    toggle: () => debugOnce('WorkspaceShim.leftRibbon', '[WorkspaceShim] leftRibbon: Slatebase has no ribbon UI — hide/show/toggle are no-ops.'),
    collapsed: false,
  };
  readonly rightRibbon = {
    hide: () => debugOnce('WorkspaceShim.rightRibbon', '[WorkspaceShim] rightRibbon: Slatebase has no ribbon UI — hide/show/toggle are no-ops.'),
    show: () => debugOnce('WorkspaceShim.rightRibbon', '[WorkspaceShim] rightRibbon: Slatebase has no ribbon UI — hide/show/toggle are no-ops.'),
    toggle: () => debugOnce('WorkspaceShim.rightRibbon', '[WorkspaceShim] rightRibbon: Slatebase has no ribbon UI — hide/show/toggle are no-ops.'),
    collapsed: false,
  };

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
    debugOnce('WorkspaceShim.createLeafInParent', '[WorkspaceShim] createLeafInParent: Slatebase has no split/parent structure — created a new tab instead.');
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
      'getOrCreateEmptyLeaf',
      'openFileDirectly',
      'removeAllListeners',
      'setViewRegistry',
      'registerView',
      'getLeaf',
      'getRightLeaf',
      'getLeftLeaf',
      'ensureSideLeaf',
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
      'leftRibbon',
      'rightRibbon',
      'openPopoutLeaf',
      'getLayout',
      'getLeafById',
      'createLeafInParent',
      'getActiveFileView',
      'iterateCodeMirrors',
      'protocolHandlers',
      'protocolHandler',
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
      get(target: WorkspaceShim, prop: string | symbol): unknown {
        // Allow access to emulated properties directly. `target` (not the
        // Proxy) is passed as the receiver so getters run with `this` bound
        // to the real instance — otherwise a getter that reads `this.somePrivateField`
        // (not itself in emulatedProperties) would re-enter this trap via the
        // Proxy and get the generic no-op-function gap value instead of the
        // real field. That's exactly how `activeEditor`'s `this.editorShim`
        // read used to come back as a callable stub instead of the EditorShim,
        // crashing any plugin that then called `.hasFocus()` on it.
        if (emulatedProperties.has(prop)) {
          const value = Reflect.get(target, prop, target);
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        // Allow symbol properties (iterator, toStringTag, etc.) and standard object properties
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, target);
        }

        // A callable `then` makes this object "thenable" — if the proxy is ever
        // returned from an async function or otherwise flows through a Promise,
        // the native Promise resolution algorithm calls it as `then(resolve,
        // reject)` instead of just settling with the proxy, and since the no-op
        // below never calls resolve/reject, that await hangs forever. Must stay
        // a plain `undefined`, not fall into the generic callable-no-op path.
        if (prop === 'then') {
          return undefined;
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
