import type { WorkspaceLeaf } from './view-registry'

/**
 * EventRef — Reference to a registered event listener.
 * Used for tracking and deregistering event subscriptions.
 */
export interface EventRef {
  id: string;
  event: string;
  callback: (...args: unknown[]) => void;
}

/**
 * IEventEmitter — Obsidian-compatible event emitter interface.
 * Provides synchronous dispatch in registration order with exception isolation.
 */
export interface IEventEmitter {
  on(event: string, callback: (...args: unknown[]) => void): EventRef;
  off(event: string, callback: (...args: unknown[]) => void): void;
  trigger(event: string, ...args: unknown[]): void;
  offref(ref: EventRef): void;
  removeAllListeners(): void;
}

/**
 * IWorkspaceShim — Obsidian Workspace API emulation interface.
 * Provides active file tracking, event emission, leaf management, view management,
 * and no-op stubs for non-emulated methods.
 */
export interface IWorkspaceShim {
  // ─── Existing Methods ──────────────────────────────────────────────────────

  /** Returns the currently active TFile, or null if no file tab is active. */
  getActiveFile(): TFile | null;
  /** Register an event listener. */
  on(event: string, callback: (...args: unknown[]) => void): EventRef;
  /** Unregister an event listener. */
  off(event: string, callback: (...args: unknown[]) => void): void;
  /** Emit an event with the given arguments. */
  trigger(event: string, ...args: unknown[]): void;

  // ─── Leaf Management ───────────────────────────────────────────────────────

  /** Get or create a workspace leaf. Pass `true` to force a new leaf (tab). */
  getLeaf(newLeaf?: boolean | string): WorkspaceLeaf;
  /** Get or create a leaf in the right sidebar (Context Panel). */
  getRightLeaf(split?: boolean): WorkspaceLeaf;
  /** Get or create a leaf in the left sidebar (rendered in Context Panel). */
  getLeftLeaf(split?: boolean): WorkspaceLeaf;
  /** Returns the currently active leaf, or null if none is active. */
  getActiveLeaf(): WorkspaceLeaf | null;
  /** Set the given leaf as the active leaf (activates the associated tab). */
  setActiveLeaf(leaf: WorkspaceLeaf): void;
  /** Get an unpinned leaf (creates a new leaf; Slatebase has no pinning). */
  getUnpinnedLeaf(): WorkspaceLeaf;
  /** Reveal a leaf by activating its tab or sidebar section. */
  revealLeaf(leaf: WorkspaceLeaf): void;
  /** Create a new leaf by splitting an existing leaf (opens as new tab). */
  createLeafBySplit(leaf: WorkspaceLeaf): WorkspaceLeaf;
  /** Split the active leaf (opens as new tab). */
  splitActiveLeaf(): WorkspaceLeaf;

  // ─── View Management ───────────────────────────────────────────────────────

  /** Register a view type with its factory function. */
  registerView(viewType: string, creator: (leaf: WorkspaceLeaf) => unknown): void;
  /** Get all leaves whose view matches the given view type. */
  getLeavesOfType(viewType: string): WorkspaceLeaf[];
  /** Detach (close) all leaves of the given view type. */
  detachLeavesOfType(viewType: string): void;
  /** Get the active view if it is an instance of the given class, or null. */
  getActiveViewOfType<T>(viewClass: new (...args: unknown[]) => T): T | null;
  /** Iterate over all active leaves (main area and sidebar). */
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => void): void;
  /** Iterate over root leaves only (main area tabs, not sidebar). */
  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => void): void;

  // ─── Link Navigation ───────────────────────────────────────────────────────

  /** Resolve and open a wikilink target in a tab. */
  openLinkText(linkText: string, sourcePath: string): Promise<void>;

  /** Execute a callback when the workspace layout is ready. */
  onLayoutReady(callback: () => void): void;
}

// ─── Obsidian-compatible data models ───────────────────────────────────────────

/**
 * IVaultShim — Obsidian-compatible Vault interface subset.
 */
export interface IVaultShim {
  read(file: TFile): Promise<string>;
  modify(file: TFile, content: string): Promise<void>;
  create(path: string, content?: string): Promise<TFile>;
  createFolder(path: string): Promise<TFolder>;
  delete(file: TAbstractFile): Promise<void>;
  getAbstractFileByPath(path: string): TAbstractFile | null;
  getMarkdownFiles(): TFile[];
  getFiles(): TFile[];
  getName(): string;
  getConfig(key: string): unknown;
  on(event: string, callback: (...args: unknown[]) => void): EventRef;
  off(event: string, callback: (...args: unknown[]) => void): void;
  trigger(event: string, ...args: unknown[]): void;
}

/**
 * TFile — Obsidian-compatible file representation.
 */
export interface TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  stat: { mtime: number; ctime: number; size: number };
  parent: TFolder | null;
}

/**
 * TFolder — Obsidian-compatible folder representation.
 */
export interface TFolder {
  path: string;
  name: string;
  children: TAbstractFile[];
  parent: TFolder | null;
  isRoot(): boolean;
}

/**
 * TAbstractFile — Union of TFile and TFolder.
 */
export type TAbstractFile = TFile | TFolder;

// ─── Metadata Cache types ──────────────────────────────────────────────────────

/**
 * Pos — Position range in a document.
 */
export interface Pos {
  start: { line: number; col: number; offset: number };
  end: { line: number; col: number; offset: number };
}

/**
 * LinkCache — A resolved link entry from a document.
 */
export interface LinkCache {
  link: string;
  displayText?: string;
  position: Pos;
  original: string;
}

/**
 * TagCache — A tag entry from a document.
 */
export interface TagCache {
  tag: string;
  position: Pos;
}

/**
 * HeadingCache — A heading entry from a document.
 */
export interface HeadingCache {
  heading: string;
  level: number;
  position: Pos;
}

/**
 * EmbedCache — An embed entry from a document.
 */
export interface EmbedCache {
  link: string;
  displayText?: string;
  position: Pos;
  original: string;
}

/**
 * CachedMetadata — Parsed metadata for a single file.
 * Contains frontmatter, links, tags, headings, and embeds.
 */
export interface CachedMetadata {
  frontmatter?: Record<string, unknown>;
  links?: LinkCache[];
  tags?: TagCache[];
  headings?: HeadingCache[];
  embeds?: EmbedCache[];
}

/**
 * IMetadataCacheShim — Obsidian-compatible MetadataCache interface subset.
 */
export interface IMetadataCacheShim {
  getFileCache(file: TFile): CachedMetadata | null;
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
  resolvedLinks: Record<string, Record<string, number>>;
  on(event: string, callback: (...args: unknown[]) => void): EventRef;
  off(event: string, callback: (...args: unknown[]) => void): void;
  trigger(event: string, ...args: unknown[]): void;
}

// ─── Plugin Security and Permissions ───────────────────────────────────────────

/**
 * PluginPermissions — Configurable permissions for a plugin.
 * Deny-by-default: new plugins start with all permissions disabled.
 */
export interface PluginPermissions {
  network: boolean;
  networkAllowlist: string[];
  filesystemWrite: boolean;
  domManipulation: boolean;
}

/**
 * PluginStatus — Activation state of a plugin.
 */
export type PluginStatus = 'active' | 'inactive' | 'error' | 'loading';

/**
 * PluginRegistryEntry — Persistent registry entry for an installed plugin.
 */
export interface PluginRegistryEntry {
  pluginId: string;
  manifest: PluginManifestData;
  status: PluginStatus;
  permissions: PluginPermissions;
  compatibilityLevel: 'full' | 'partial' | 'unsupported' | 'unknown';
  error?: string;
}

/**
 * TrackedResources — Resources tracked by the sandbox for cleanup on deactivation.
 */
export interface TrackedResources {
  timers: Set<number>;
  domElements: Set<Element>;
  eventListeners: Array<{ target: EventTarget; event: string; listener: EventListenerOrEventListenerObject }>;
  websockets: Set<WebSocket>;
}

/**
 * SandboxContext — Sandboxed execution context for a plugin.
 */
export interface SandboxContext {
  pluginId: string;
  vaultId: string;
  storagePrefix: string;
  permissions: PluginPermissions;
  trackedResources: TrackedResources;
}

/**
 * IPluginSandbox — Plugin sandbox interface for isolation and resource management.
 */
export interface IPluginSandbox {
  /** Create a sandboxed execution context for a plugin */
  createContext(pluginId: string, permissions: PluginPermissions): SandboxContext;
  /** Monitor main-thread blocking */
  startMonitoring(pluginId: string): void;
  /** Stop monitoring */
  stopMonitoring(pluginId: string): void;
  /** Cleanup all resources for a plugin */
  cleanup(pluginId: string): void;
}

// ─── Plugin Instance and App Shim types ────────────────────────────────────────

/**
 * PluginInstance — Runtime representation of a loaded Obsidian plugin.
 * Provides lifecycle hooks and API access methods.
 */
export interface PluginInstance {
  manifest: PluginManifestData;
  app: IAppShim;
  onload(): Promise<void> | void;
  onunload(): void;
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
  addCommand(command: { id: string; name: string; callback: () => void; hotkeys?: Hotkey[] }): void;
  addSettingTab(tab: unknown): void;
  registerEvent(eventRef: EventRef): void;
  registerView(viewType: string, creator: unknown): void;
}

/**
 * PluginManifestData — Minimal manifest data carried by plugin instances.
 */
export interface PluginManifestData {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  author?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Hotkey — Keyboard shortcut definition for a command.
 */
export interface Hotkey {
  modifiers: string[];
  key: string;
}

/**
 * IAppShim — Obsidian App API emulation interface.
 * Central entry point for plugins to access vault, workspace, and metadata cache.
 */
export interface IAppShim {
  vault: IVaultShim;
  workspace: IWorkspaceShim;
  metadataCache: IMetadataCacheShim;
  plugins: {
    plugins: Record<string, PluginInstance>;
    enabledPlugins: Set<string>;
    getPlugin(id: string): PluginInstance | undefined;
  };
}
