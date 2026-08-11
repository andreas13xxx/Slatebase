/**
 * Obsidian API Extensions — Additional global APIs, DOM utilities, and classes
 * required by popular plugins (Dataview, LiveSync, Templater, Calendar, Excalidraw,
 * Editing Toolbar, Kanban).
 *
 * This file is imported by setting-tab.ts to register everything on window.obsidian.
 * It covers:
 * - Icon management (addIcon, setIcon, getIcon, getIconIds)
 * - Events class (base EventEmitter)
 * - Scope & Keymap (keyboard handling)
 * - DOM globals (createEl, createDiv, createSpan, createFragment)
 * - Utility functions (parseYaml, stringifyYaml, getAllTags, parseLinktext, etc.)
 * - Additional Plugin methods
 * - Extra UI component classes
 * - MarkdownPreviewRenderer
 *
 * @module obsidian-api-extensions
 */

import { getBuiltInIconIds, getLucideIconElement, renderLucideIconInto } from './lucide-icons';
import { errorOnce, warnNoOp } from './log';
import type { BlockCache, CachedMetadata, HeadingCache, Pos } from './types';

/**
 * The Obsidian API version Slatebase claims to implement.
 *
 * Read by plugins as `apiVersion` and used by `requireApiVersion()`, which must
 * answer against the same number — a `requireApiVersion()` that always says yes
 * sends plugins down code paths using APIs we do not have, and they crash there
 * instead of taking the fallback they already wrote.
 *
 * Raise this only when the corresponding APIs actually exist here.
 *
 * 1.4.14: the `obsidian` npm typings package never published past 1.4.11
 * within the 1.4.x line (no 1.4.12–14 release exists), so "1.4.14" and
 * "1.4.11" are the same documented API surface. That surface is fully
 * implemented here: Debouncer.run() (install-globals.ts debounce()),
 * FileManager.processFrontMatter()'s DataWriteOptions param, Setting.
 * addProgressBar(), AbstractInputSuggest, and the 'file-menu' workspace event.
 *
 * 1.8.7: audited every documented API addition between 1.4.11 and 1.8.7
 * against the official obsidianmd/obsidian-api CHANGELOG.md (the desktop
 * app's own changelog is UI-focused and mostly silent on plugin API surface).
 * Implemented as part of that audit:
 * - 1.5.7: Plugin.onExternalSettingsChange (plugin-settings:change SSE event,
 *   see settings-manager.ts/plugin-context.ts), Vault.getFileByPath/
 *   getFolderByPath, View.scope (view-registry.ts), getFrontMatterInfo,
 *   FileManager.getAvailablePathForAttachment
 * - 1.5.9: SliderComponent.setInstant() (setting-tab.ts)
 * - 1.7.2: Plugin.onUserEnable (plugin-context.ts), Plugin.removeCommand,
 *   SuggestModal.selectActiveSuggestion, Workspace.ensureSideLeaf
 *   (workspace-shim.ts), WorkspaceLeaf.isDeferred/loadIfDeferred
 *   (view-registry.ts — always false/no-op, Slatebase never defers a leaf's
 *   view), prepareFuzzySearch already the only search primitive implemented
 * - 1.8.7 (community-tracked, not in the official changelog):
 *   loadLocalStorage/saveLocalStorage (app-shim.ts), CachedMetadata.
 *   footnoteRefs/referenceLinks (metadata-parser.ts)
 *
 * `Scope`/`Keymap` (this file) went from inert stand-ins to an actually
 * dispatching hotkey stack as a prerequisite for View.scope to mean anything.
 */
export const OBSIDIAN_API_VERSION = '1.8.7';

/**
 * Compare two dotted version strings. Missing components count as 0, so
 * `'1.5'` and `'1.5.0'` are equal, matching how plugins write these checks.
 */
export function compareApiVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

// ─── Icon Registry ───────────────────────────────────────────────────────────────

const customIcons: Map<string, string> = new Map();

/**
 * Add a custom icon to the library.
 * Plugins use this to register SVG icons by ID.
 */
export function addIcon(iconId: string, svgContent: string): void {
  customIcons.set(iconId, svgContent);
}

/**
 * Remove a custom icon from the library.
 */
export function removeIcon(iconId: string): void {
  customIcons.delete(iconId);
}

/**
 * Get an SVG element for an icon ID.
 * Checks plugin-registered custom icons first, then the built-in Lucide set.
 */
export function getIcon(iconId: string): SVGSVGElement | null {
  const svg = customIcons.get(iconId);
  if (svg) {
    const container = document.createElement('div');
    container.innerHTML = svg;
    const svgEl = container.querySelector('svg');
    // A registered custom icon whose content isn't a full <svg>...</svg> string
    // (e.g. bare path data) has no element to return here. Obsidian guarantees
    // getIcon() never returns null for an id getIconIds() listed (customIcons
    // keys are included there) — fall back to the Lucide-resolved icon instead
    // of breaking that contract.
    if (svgEl) return svgEl;
  }
  return getLucideIconElement(iconId);
}

/**
 * Get the list of icon IDs `getIcon()`/`setIcon()` accept — plugin-registered
 * custom icons plus the built-in (Lucide) set, as Obsidian does.
 */
export function getIconIds(): string[] {
  return [...customIcons.keys(), ...getBuiltInIconIds()];
}

/**
 * Insert an SVG icon into an element.
 * Tries custom icons first, then Lucide icons via class name.
 */
export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.innerHTML = '';
  const svg = customIcons.get(iconId);
  if (svg) {
    parent.innerHTML = svg;
    return;
  }
  renderLucideIconInto(parent, iconId);
}

// ─── Events Class ────────────────────────────────────────────────────────────────

/**
 * Events — Base class for Obsidian's event system.
 * Dataview and other plugins extend this for custom event emitters.
 */
export class Events {
  private _events: Map<string, Array<{ callback: (...args: unknown[]) => unknown; ctx?: unknown }>> = new Map();

  on(name: string, callback: (...data: unknown[]) => unknown, ctx?: unknown): { id: number } {
    if (!this._events.has(name)) this._events.set(name, []);
    const handlers = this._events.get(name)!;
    handlers.push({ callback, ctx });
    return { id: handlers.length - 1 };
  }

  off(name: string, callback: (...data: unknown[]) => unknown): void {
    const handlers = this._events.get(name);
    if (!handlers) return;
    const idx = handlers.findIndex(h => h.callback === callback);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  offref(_ref: { id: number }): void {
    // In Obsidian, offref removes a specific event reference. No-op here.
  }

  trigger(name: string, ...data: unknown[]): void {
    const handlers = this._events.get(name);
    if (!handlers) return;
    for (const { callback, ctx } of handlers) {
      try { callback.apply(ctx, data); } catch (e) { errorOnce(`Events.handlerError::${name}`, `[Events] Handler error for "${name}":`, e); }
    }
  }

  tryTrigger(_evt: unknown, _args: unknown[]): void {
    // No-op — internal Obsidian method
  }
}

// ─── Scope & Keymap ──────────────────────────────────────────────────────────────

/** Whether a registered modifier list matches the modifiers actually held down on a keyboard event. */
function matchesModifiers(modifiers: string[] | null, evt: KeyboardEvent): boolean {
  if (modifiers === null) return true;
  const want = new Set(modifiers);
  // 'Mod' is the cross-platform alias for Ctrl (Win/Linux) / Cmd (Mac) — it consumes
  // whichever one actually fired instead of requiring both 'Ctrl' and 'Meta' to match.
  if (want.has('Mod') && !(evt.ctrlKey || evt.metaKey)) return false;
  const ctrlPressed = evt.ctrlKey && !want.has('Mod');
  const metaPressed = evt.metaKey && !want.has('Mod');
  if (want.has('Ctrl') !== ctrlPressed) return false;
  if (want.has('Meta') !== metaPressed) return false;
  if (want.has('Shift') !== evt.shiftKey) return false;
  if (want.has('Alt') !== evt.altKey) return false;
  return true;
}

/**
 * Scope — Handles keyboard events with registered hotkeys.
 * Used by Modals, suggest popups, and views for keyboard navigation.
 *
 * Plugins register handlers via `register(modifiers, key, callback)` and activate
 * the scope by pushing it onto the keymap stack (`app.keymap.pushScope(this.scope)`,
 * typically in `onOpen()`/paired with `popScope()` in `onClose()`). See
 * {@link dispatchKeydownToScopeStack}, which is what actually calls `handleKey()`.
 */
export class Scope {
  private handlers: Array<{ modifiers: string[] | null; key: string | null; func: (...args: unknown[]) => unknown }> = [];

  /**
   * Compat shim for plugins (Kanban) that read/reset Obsidian's private `keys`
   * array directly instead of going through `register()`/`unregister()`. Not
   * part of the public API — kept as a plain array (not a method) because
   * that's the shape actually exercised in production; see plugin-loader.ts.
   */
  keys: unknown[] = [];

  constructor(_parent?: Scope) {}

  register(modifiers: string[] | null, key: string | null, func: (...args: unknown[]) => unknown): { modifiers: string[] | null; key: string | null; func: (...args: unknown[]) => unknown } {
    const handler = { modifiers, key, func };
    this.handlers.push(handler);
    return handler;
  }

  unregister(handler: { modifiers: string[] | null; key: string | null; func: (...args: unknown[]) => unknown }): void {
    const idx = this.handlers.indexOf(handler);
    if (idx >= 0) this.handlers.splice(idx, 1);
  }

  /**
   * Try every registered handler against a keydown event, most recently
   * registered first. A handler "handles" the event unless it explicitly
   * returns `false`, matching Obsidian's convention — at which point the
   * event is prevented from its default action and no further scope on the
   * stack is consulted.
   */
  handleKey(evt: KeyboardEvent): boolean {
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const h = this.handlers[i]!;
      if (h.key !== null && h.key.toLowerCase() !== evt.key.toLowerCase()) continue;
      if (!matchesModifiers(h.modifiers, evt)) continue;
      const result = h.func(evt, this);
      if (result !== false) {
        evt.preventDefault();
        return true;
      }
    }
    return false;
  }
}

/**
 * The active scope stack, shared across every `Keymap` instance — matching
 * real Obsidian, where hotkey scoping is global to the window, not per-App.
 */
const scopeStack: Scope[] = [];

/**
 * Dispatch a keydown event through the active scope stack, most recently
 * pushed scope first.
 *
 * Obsidian's model: once a plugin pushes a Scope (typically in a View's
 * `onOpen()`, popped again in `onClose()`), it gets first refusal on every
 * keydown — even ahead of Slatebase's own shortcuts — until popped. The stack
 * starts empty and nothing is pushed onto it unless a plugin explicitly opts
 * in, so this is inert until then.
 *
 * @returns Whether a handler consumed the event (and therefore already called `preventDefault()`).
 */
export function dispatchKeydownToScopeStack(evt: KeyboardEvent): boolean {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    if (scopeStack[i]!.handleKey(evt)) return true;
  }
  return false;
}

/**
 * Keymap — Manages keymap lifecycle for different Scopes.
 */
export class Keymap {
  static isModifier(evt: MouseEvent | KeyboardEvent, modifier: string): boolean {
    if (modifier === 'Mod') return evt.metaKey || evt.ctrlKey;
    if (modifier === 'Ctrl') return evt.ctrlKey;
    if (modifier === 'Meta') return evt.metaKey;
    if (modifier === 'Shift') return evt.shiftKey;
    if (modifier === 'Alt') return evt.altKey;
    return false;
  }

  static isModEvent(evt?: MouseEvent | KeyboardEvent | null): string | boolean {
    if (!evt) return false;
    const mod = evt.metaKey || evt.ctrlKey;
    if (mod && evt.altKey && evt.shiftKey) return 'window';
    if (mod && evt.altKey) return 'split';
    if (mod || (evt instanceof MouseEvent && evt.button === 1)) return 'tab';
    return false;
  }

  pushScope(scope: Scope): void {
    scopeStack.push(scope);
  }

  popScope(scope: Scope): void {
    const idx = scopeStack.lastIndexOf(scope);
    if (idx >= 0) scopeStack.splice(idx, 1);
  }
}

// ─── DOM Global Helpers ──────────────────────────────────────────────────────────

/**
 * Create an HTML element with optional configuration.
 * Obsidian exposes this as a global and on Node.prototype.
 */
export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  o?: { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean | null>; parent?: Node; href?: string; type?: string; value?: string; placeholder?: string; prepend?: boolean; title?: string } | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (typeof o === 'string') {
    el.className = o;
  } else if (o) {
    if (o.cls) {
      if (Array.isArray(o.cls)) el.className = o.cls.join(' ');
      else el.className = o.cls;
    }
    if (o.text) el.textContent = o.text;
    if (o.title) el.title = o.title;
    if (o.attr) {
      for (const [k, v] of Object.entries(o.attr)) {
        if (v !== null && v !== undefined) el.setAttribute(k, String(v));
      }
    }
    if (o.href && 'href' in el) (el as unknown as HTMLAnchorElement).href = o.href;
    if (o.type && 'type' in el) (el as unknown as HTMLInputElement).type = o.type;
    if (o.value && 'value' in el) (el as unknown as HTMLInputElement).value = o.value;
    if (o.placeholder && 'placeholder' in el) (el as unknown as HTMLInputElement).placeholder = o.placeholder;
    if (o.parent) {
      if (o.prepend) o.parent.insertBefore(el, o.parent.firstChild);
      else o.parent.appendChild(el);
    }
  }
  if (callback) callback(el);
  return el;
}

export function createDiv(
  o?: { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean | null>; parent?: Node } | string,
  callback?: (el: HTMLDivElement) => void
): HTMLDivElement {
  return createEl('div', o, callback);
}

export function createSpan(
  o?: { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean | null>; parent?: Node } | string,
  callback?: (el: HTMLSpanElement) => void
): HTMLSpanElement {
  return createEl('span', o, callback);
}

export function createFragment(callback?: (el: DocumentFragment) => void): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (callback) callback(frag);
  return frag;
}

// ─── Utility Functions ───────────────────────────────────────────────────────────

/**
 * Parse a YAML string into a JS object.
 * Uses a simple regex-based parser for common frontmatter patterns.
 */
export function parseYaml(yaml: string): unknown {
  try {
    // Use the yaml library if available on window
    const yamlLib = (window as unknown as { jsyaml?: { load: (s: string) => unknown } }).jsyaml;
    if (yamlLib) return yamlLib.load(yaml);
    // Fallback: simple line-based key:value parsing
    const result: Record<string, unknown> = {};
    for (const line of yaml.split('\n')) {
      const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1]!;
        let val: unknown = match[2]!.trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (val === 'null' || val === '') val = null;
        else if (!isNaN(Number(val))) val = Number(val);
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Stringify a JS object to YAML format.
 */
export function stringifyYaml(obj: unknown): string {
  const yamlLib = (window as unknown as { jsyaml?: { dump: (o: unknown) => string } }).jsyaml;
  if (yamlLib) return yamlLib.dump(obj);
  // Fallback: simple serialization
  if (!obj || typeof obj !== 'object') return String(obj ?? '');
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${String(item)}`);
    } else {
      lines.push(`${key}: ${String(value ?? '')}`);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Get all tags from a CachedMetadata object.
 */
export function getAllTags(cache: { tags?: Array<{ tag: string }>; frontmatter?: Record<string, unknown> } | null): string[] | null {
  if (!cache) return null;
  const tags: string[] = [];
  if (cache.tags) {
    for (const t of cache.tags) tags.push(t.tag);
  }
  if (cache.frontmatter) {
    const fmTags = cache.frontmatter['tags'] ?? cache.frontmatter['tag'];
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        const s = String(t);
        tags.push(s.startsWith('#') ? s : `#${s}`);
      }
    } else if (typeof fmTags === 'string') {
      for (const t of fmTags.split(/[,\s]+/).filter(Boolean)) {
        tags.push(t.startsWith('#') ? t : `#${t}`);
      }
    }
  }
  return tags.length > 0 ? tags : null;
}

/**
 * Parse linktext into path and subpath components.
 */
export function parseLinktext(linktext: string): { path: string; subpath: string } {
  const hashIdx = linktext.indexOf('#');
  if (hashIdx === -1) return { path: linktext, subpath: '' };
  return { path: linktext.slice(0, hashIdx), subpath: linktext.slice(hashIdx) };
}

/**
 * Get the link path from a linktext (strips subpath).
 */
export function getLinkpath(linktext: string): string {
  return parseLinktext(linktext).path;
}

/**
 * Convert HTML to Markdown (simplified).
 */
export function htmlToMarkdown(html: string | HTMLElement | Document | DocumentFragment): string {
  if (typeof html === 'string') {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent ?? '';
  }
  return (html as HTMLElement).textContent ?? '';
}

/**
 * Sanitize an HTML string to a DocumentFragment (strips scripts).
 */
export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  // Remove script tags
  for (const script of template.content.querySelectorAll('script')) {
    script.remove();
  }
  return template.content;
}

/**
 * Get frontmatter info from file content.
 */
export function getFrontMatterInfo(content: string): { exists: boolean; frontmatter: string; from: number; to: number; contentStart: number } {
  if (!content.startsWith('---')) {
    return { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 };
  }
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0 };
  }
  const from = 4; // after "---\n"
  const to = endIdx;
  const contentStart = endIdx + 4; // after "\n---"
  return { exists: true, frontmatter: content.slice(from, to), from, to, contentStart };
}

/**
 * Parse a single frontmatter entry by key.
 */
export function parseFrontMatterEntry(frontmatter: Record<string, unknown> | null, key: string | RegExp): unknown {
  if (!frontmatter) return null;
  if (typeof key === 'string') return frontmatter[key] ?? null;
  for (const k of Object.keys(frontmatter)) {
    if (key.test(k)) return frontmatter[k];
  }
  return null;
}

/**
 * Parse a frontmatter string array entry.
 */
export function parseFrontMatterStringArray(frontmatter: Record<string, unknown> | null, key: string | RegExp): string[] | null {
  const value = parseFrontMatterEntry(frontmatter, key);
  if (!value) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/[,\s]+/).filter(Boolean);
  return null;
}

/**
 * Construct a fuzzy search callback.
 */
export function prepareFuzzySearch(query: string): (text: string) => { score: number; matches: Array<[number, number]> } | null {
  const lower = query.toLowerCase();
  return (text: string) => {
    const textLower = text.toLowerCase();
    let score = 0;
    let qIdx = 0;
    const matches: Array<[number, number]> = [];
    for (let i = 0; i < textLower.length && qIdx < lower.length; i++) {
      if (textLower[i] === lower[qIdx]) {
        matches.push([i, i + 1]);
        score += 1;
        qIdx++;
      }
    }
    if (qIdx < lower.length) return null;
    return { score: score / text.length, matches };
  };
}

/**
 * Construct a simple search callback (space-separated words).
 */
export function prepareSimpleSearch(query: string): (text: string) => { score: number; matches: Array<[number, number]> } | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (text: string) => {
    const textLower = text.toLowerCase();
    const matches: Array<[number, number]> = [];
    for (const word of words) {
      const idx = textLower.indexOf(word);
      if (idx === -1) return null;
      matches.push([idx, idx + word.length]);
    }
    return { score: matches.length / text.length, matches };
  };
}

/** A scored match, as returned by the `prepare*Search` callbacks. */
export interface SearchResult {
  score: number;
  matches: Array<[number, number]>;
}

/** A search result paired with the item it came from. */
export interface SearchResultContainer<T = unknown> {
  match: SearchResult;
  item: T;
}

/**
 * Run a one-off fuzzy match of `query` against `text`.
 *
 * The convenience form of {@link prepareFuzzySearch} for callers matching a
 * single string; `prepareFuzzySearch` is the one to use in a loop, since it
 * lowercases the query once instead of per candidate.
 */
export function fuzzySearch(query: string, text: string): SearchResult | null {
  return prepareFuzzySearch(query)(text);
}

/**
 * Sort search results in place, best match first.
 *
 * Obsidian's suggestion lists rely on this rather than each plugin sorting by
 * `.match.score` itself, so the ordering stays consistent across plugins.
 */
export function sortSearchResults(results: SearchResultContainer[]): void {
  results.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
}

/**
 * Render `text` into `el`, wrapping the matched ranges in `<span class="suggestion-highlight">`.
 *
 * Ranges are applied in order and non-overlapping; anything out of order or
 * overlapping is skipped rather than producing scrambled output, since a match
 * list is data from a plugin's own scoring function and need not be well-formed.
 */
export function renderMatches(
  el: HTMLElement,
  text: string,
  matches: Array<[number, number]> | null,
  offset = 0,
): void {
  if (!matches || matches.length === 0) {
    el.appendChild(document.createTextNode(text));
    return;
  }
  let cursor = 0;
  for (const range of matches) {
    const start = (range[0] ?? 0) + offset;
    const end = (range[1] ?? 0) + offset;
    if (start < cursor || end <= start || start > text.length) continue;
    if (start > cursor) el.appendChild(document.createTextNode(text.slice(cursor, start)));
    const highlight = document.createElement('span');
    highlight.className = 'suggestion-highlight';
    highlight.textContent = text.slice(start, end);
    el.appendChild(highlight);
    cursor = end;
  }
  if (cursor < text.length) el.appendChild(document.createTextNode(text.slice(cursor)));
}

/**
 * Render a search result's text into `el` with its matched ranges highlighted.
 *
 * The element is cleared first — Obsidian re-renders suggestion rows in place as
 * the query changes.
 */
export function renderResults(
  el: HTMLElement,
  text: string,
  result: SearchResult | null,
  offset = 0,
): void {
  el.textContent = '';
  renderMatches(el, text, result?.matches ?? null, offset);
}

// ─── Subpath resolution ──────────────────────────────────────────────────────────

/** What a `#heading` or `#^block` subpath resolved to. */
export interface SubpathResult {
  type: 'heading' | 'block';
  /** The matched HeadingCache or BlockCache entry. */
  current?: HeadingCache | BlockCache;
  start: Pos['start'];
  /** Where the addressed section ends; null means "to the end of the file". */
  end: Pos['start'] | null;
}

/**
 * Resolve the `#...` part of a link against a file's cached metadata.
 *
 * `[[Note#Heading]]` and `[[Note#^blockid]]` are how Obsidian addresses part of
 * a file, and plugins that render or transclude link targets call this to turn
 * the fragment into a document range. Heading resolution matches the way
 * Obsidian does: on the heading text with formatting stripped, so `#Über uns`
 * still finds a `## **Über uns**`.
 *
 * @param cache - The file's parsed metadata
 * @param subpath - The fragment, with or without its leading `#`
 * @returns The resolved range, or null if nothing in the file matches
 */
export function resolveSubpath(
  cache: CachedMetadata | null | undefined,
  subpath: string,
): SubpathResult | null {
  if (!cache) return null;
  const fragment = subpath.startsWith('#') ? subpath.slice(1) : subpath;
  if (!fragment) return null;

  if (fragment.startsWith('^')) {
    const block = cache.blocks?.[fragment.slice(1).toLowerCase()];
    if (!block) return null;
    return { type: 'block', current: block, start: block.position.start, end: block.position.end };
  }

  const headings = cache.headings ?? [];
  const wanted = stripHeading(fragment).toLowerCase();
  const index = headings.findIndex((h) => stripHeading(h.heading).toLowerCase() === wanted);
  const heading = headings[index];
  if (!heading) return null;

  // The section runs to the next heading of the same or higher level; a null
  // end means "to the end of the file", which is what Obsidian reports too.
  const next = headings.slice(index + 1).find((h) => h.level <= heading.level);
  return {
    type: 'heading',
    current: heading,
    start: heading.position.start,
    end: next ? next.position.start : null,
  };
}

// ─── Blob / async module loaders ─────────────────────────────────────────────────

/** Read a Blob into an ArrayBuffer. Obsidian's promisified `FileReader` helper. */
export function getBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

/**
 * Resolve the Mermaid instance, loading it on first use.
 *
 * Obsidian bundles Mermaid and hands plugins the module object; Slatebase has
 * the same dependency for its own diagram rendering, so this is the real library
 * rather than a stub.
 */
export async function loadMermaid(): Promise<unknown> {
  const mod = await import('mermaid');
  return mod.default ?? mod;
}

/**
 * Register the loaders for libraries Slatebase does not ship.
 *
 * MathJax, Prism and PDF.js are all in Obsidian's bundle, and plugins call these
 * loaders unguarded — `await loadMathJax()` on a namespace without the function
 * is a TypeError somewhere unrelated to the actual cause. Defining them means
 * the plugin gets a named, logged answer instead.
 *
 * They are deliberately *not* implemented: LaTeX rendering, Prism highlighting
 * and PDF rendering are each a feature Slatebase does not have, not an oversight
 * in the compat layer. Adding the dependency here would put a renderer behind
 * the plugin API that the app's own Markdown pipeline cannot use.
 *
 * `renderMath` returns an element containing the raw source, so a formula shows
 * up as its own LaTeX rather than vanishing.
 */
function registerUnsupportedLoaders(obs: Record<string, unknown>): void {
  const unavailable = (api: string, feature: string) => (): Promise<null> => {
    warnNoOp('obsidian', api, `Slatebase does not bundle ${feature}; the plugin's ${feature} features will not render.`);
    return Promise.resolve(null);
  };

  if (!obs['loadMathJax']) obs['loadMathJax'] = unavailable('loadMathJax', 'MathJax');
  if (!obs['loadPrism']) obs['loadPrism'] = unavailable('loadPrism', 'Prism');
  if (!obs['loadPdfJs']) obs['loadPdfJs'] = unavailable('loadPdfJs', 'PDF.js');

  if (!obs['renderMath']) {
    obs['renderMath'] = (source: string, display: boolean): HTMLElement => {
      warnNoOp('obsidian', 'renderMath', 'Slatebase does not bundle MathJax; the formula source is shown verbatim.');
      const el = document.createElement(display ? 'div' : 'span');
      el.className = display ? 'math math-block' : 'math math-inline';
      el.textContent = source;
      return el;
    };
  }
  // Paired with renderMath in Obsidian's typesetting cycle. Nothing to flush
  // without MathJax, and renderMath already warned — staying quiet here avoids
  // a second line for the same cause.
  if (!obs['finishRenderMath']) obs['finishRenderMath'] = (): Promise<void> => Promise.resolve();
}

// ─── Additional UI Components ────────────────────────────────────────────────────

/**
 * ExtraButtonComponent — Icon button used in settings rows.
 */
export class ExtraButtonComponent {
  extraSettingsEl: HTMLElement;
  private _disabled = false;
  private _callback: (() => void) | null = null;

  constructor(containerEl: HTMLElement) {
    this.extraSettingsEl = document.createElement('div');
    this.extraSettingsEl.className = 'extra-setting-button';
    containerEl.appendChild(this.extraSettingsEl);
    this.extraSettingsEl.addEventListener('click', () => {
      if (!this._disabled && this._callback) this._callback();
    });
  }

  setDisabled(disabled: boolean): this { this._disabled = disabled; return this; }
  setTooltip(tooltip: string): this { this.extraSettingsEl.title = tooltip; return this; }
  setIcon(_icon: string): this { return this; }
  onClick(callback: () => void): this { this._callback = callback; return this; }
  then(cb: (component: this) => void): this { cb(this); return this; }
}

/**
 * ColorComponent — Color picker for settings.
 */
export class ColorComponent {
  colorEl: HTMLInputElement;
  private _callback: ((value: string) => void) | null = null;

  constructor(containerEl: HTMLElement) {
    this.colorEl = document.createElement('input');
    this.colorEl.type = 'color';
    this.colorEl.className = 'color-component';
    containerEl.appendChild(this.colorEl);
    this.colorEl.addEventListener('input', () => {
      if (this._callback) this._callback(this.colorEl.value);
    });
  }

  getValue(): string { return this.colorEl.value; }
  setValue(value: string): this { this.colorEl.value = value; return this; }
  setDisabled(disabled: boolean): this { this.colorEl.disabled = disabled; return this; }
  onChange(callback: (value: string) => void): this { this._callback = callback; return this; }
  then(cb: (component: this) => void): this { cb(this); return this; }
}

/**
 * SearchComponent — Search input for settings.
 */
export class SearchComponent {
  /**
   * The `.search-input-container` Obsidian wraps the input in. The clear button
   * is positioned against it, so it is structural rather than cosmetic — plugin
   * CSS that styles the search box targets this element.
   */
  containerEl: HTMLElement;
  inputEl: HTMLInputElement;
  clearButtonEl: HTMLElement;
  private _callback: ((value: string) => void) | null = null;

  constructor(containerEl: HTMLElement) {
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'search-input-container';
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'search';
    this.inputEl.className = 'search-input';
    this.inputEl.spellcheck = false;
    this.clearButtonEl = document.createElement('div');
    this.clearButtonEl.className = 'search-input-clear-button is-hidden';
    this.clearButtonEl.setAttribute('aria-label', 'Clear search');
    this.containerEl.appendChild(this.inputEl);
    this.containerEl.appendChild(this.clearButtonEl);
    containerEl.appendChild(this.containerEl);
    this.inputEl.addEventListener('input', () => {
      this.syncClearButton();
      if (this._callback) this._callback(this.inputEl.value);
    });
    this.clearButtonEl.addEventListener('click', () => {
      this.inputEl.value = '';
      this.syncClearButton();
      this.inputEl.focus();
      if (this._callback) this._callback('');
    });
  }

  /** Obsidian only shows the clear button once the field has content. */
  private syncClearButton(): void {
    this.clearButtonEl.classList.toggle('is-hidden', this.inputEl.value.length === 0);
  }

  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; this.syncClearButton(); return this; }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this; }
  setDisabled(disabled: boolean): this { this.inputEl.disabled = disabled; return this; }
  onChange(callback: (value: string) => void): this { this._callback = callback; return this; }
  onChanged(): void { if (this._callback) this._callback(this.inputEl.value); }
  then(cb: (component: this) => void): this { cb(this); return this; }
}

/**
 * MomentFormatComponent — Date format input with live preview.
 */
export class MomentFormatComponent {
  inputEl: HTMLInputElement;
  sampleEl: HTMLElement;
  private _defaultFormat = 'YYYY-MM-DD';
  private _callback: ((value: string) => void) | null = null;

  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'moment-format-input';
    this.sampleEl = document.createElement('span');
    this.sampleEl.className = 'moment-format-sample';
    containerEl.appendChild(this.inputEl);
    containerEl.appendChild(this.sampleEl);
    this.inputEl.addEventListener('input', () => { this.onChanged(); });
  }

  setDefaultFormat(defaultFormat: string): this {
    this._defaultFormat = defaultFormat;
    this.inputEl.placeholder = defaultFormat;
    this.updateSample();
    return this;
  }
  setSampleEl(sampleEl: HTMLElement): this { this.sampleEl = sampleEl; return this; }
  getValue(): string { return this.inputEl.value || this._defaultFormat; }
  setValue(value: string): this { this.inputEl.value = value; this.updateSample(); return this; }
  onChange(callback: (value: string) => void): this { this._callback = callback; return this; }
  onChanged(): void {
    this.updateSample();
    if (this._callback) this._callback(this.getValue());
  }
  updateSample(): void {
    const m = (window as unknown as { moment?: { (): { format: (f: string) => string } } }).moment;
    if (m) this.sampleEl.textContent = m().format(this.getValue());
  }
  then(cb: (component: this) => void): this { cb(this); return this; }
}

/**
 * ProgressBarComponent — Progress bar for settings.
 */
export class ProgressBarComponent {
  progressEl: HTMLElement;
  private _value = 0;

  constructor(containerEl: HTMLElement) {
    this.progressEl = document.createElement('progress');
    this.progressEl.className = 'progress-bar';
    (this.progressEl as HTMLProgressElement).max = 100;
    containerEl.appendChild(this.progressEl);
  }

  getValue(): number { return this._value; }
  setValue(value: number): this {
    this._value = value;
    (this.progressEl as HTMLProgressElement).value = value;
    return this;
  }
  then(cb: (component: this) => void): this { cb(this); return this; }
}

/**
 * AbstractInputSuggest — Base class for input autocomplete.
 * Templater uses this for file/folder suggest inputs in settings.
 *
 * Real Obsidian: Component -> PopoverSuggest -> AbstractInputSuggest. Built as a
 * factory (not a static class) because PopoverSuggest only exists on
 * `window.obsidian` once installObsidianGlobals() has run — see its call site in
 * registerObsidianApiExtensions() below, which passes that class in at register
 * time so open/close/renderSuggestion and Component's registerEvent/
 * registerDomEvent/addChild are all inherited for real, not reimplemented here.
 */
type PopoverSuggestBase = new (app: unknown) => {
  app: unknown;
  open(): void;
  close(): void;
  renderSuggestion(value: unknown, el: HTMLElement): void;
  selectSuggestion(value: unknown, evt: MouseEvent | KeyboardEvent): void;
};

function createAbstractInputSuggestClass(PopoverSuggest: PopoverSuggestBase) {
  return class AbstractInputSuggest extends PopoverSuggest {
    textInputEl: HTMLInputElement | HTMLDivElement;
    limit = 100;
    private _selectCallback: ((value: unknown, evt: MouseEvent | KeyboardEvent) => void) | null = null;

    constructor(app: unknown, textInputEl: HTMLInputElement | HTMLDivElement) {
      super(app);
      this.textInputEl = textInputEl;
    }

    setValue(value: string): void {
      if (this.textInputEl instanceof HTMLInputElement) {
        this.textInputEl.value = value;
      } else {
        this.textInputEl.textContent = value;
      }
    }

    getValue(): string {
      if (this.textInputEl instanceof HTMLInputElement) return this.textInputEl.value;
      return this.textInputEl.textContent ?? '';
    }

    onSelect(callback: (value: unknown, evt: MouseEvent | KeyboardEvent) => void): this {
      this._selectCallback = callback;
      return this;
    }

    selectSuggestion(value: unknown, evt: MouseEvent | KeyboardEvent): void {
      if (this._selectCallback) this._selectCallback(value, evt);
    }

    getSuggestions(_query: string): unknown[] { return []; }
  };
}

// ─── MarkdownPreviewRenderer ─────────────────────────────────────────────────────

/** Registered post processors */
const postProcessors: Array<{ processor: (el: HTMLElement, ctx: unknown) => unknown; sortOrder: number }> = [];

/**
 * MarkdownPreviewRenderer — Static class for registering post processors.
 */
export class MarkdownPreviewRenderer {
  static registerPostProcessor(postProcessor: (el: HTMLElement, ctx: unknown) => unknown, sortOrder?: number): void {
    postProcessors.push({ processor: postProcessor, sortOrder: sortOrder ?? 0 });
    postProcessors.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  static unregisterPostProcessor(postProcessor: (el: HTMLElement, ctx: unknown) => unknown): void {
    const idx = postProcessors.findIndex(p => p.processor === postProcessor);
    if (idx >= 0) postProcessors.splice(idx, 1);
  }

  static createCodeBlockPostProcessor(
    language: string,
    handler: (source: string, el: HTMLElement, ctx: unknown) => unknown
  ): (el: HTMLElement, ctx: unknown) => void {
    return (el: HTMLElement, ctx: unknown) => {
      const codeBlocks = el.querySelectorAll(`code.language-${language}`);
      for (const code of codeBlocks) {
        const pre = code.parentElement;
        if (!pre || pre.tagName !== 'PRE') continue;
        const source = code.textContent ?? '';
        const container = document.createElement('div');
        container.className = `block-language-${language}`;
        pre.replaceWith(container);
        handler(source, container, ctx);
      }
    };
  }

  /** Get all registered post processors (used internally). */
  static getPostProcessors(): Array<{ processor: (el: HTMLElement, ctx: unknown) => unknown; sortOrder: number }> {
    return postProcessors;
  }
}

// ─── EditableFileView (abstract base, extends FileView) ──────────────────────────

// EditableFileView is just an abstract intermediate class between FileView and TextFileView.
// We export a reference so plugins doing `instanceof EditableFileView` checks work.
// The actual class is already handled by TextFileView extending FileView on window.obsidian.

// ─── Encoding Utilities ──────────────────────────────────────────────────────────

/**
 * Convert an ArrayBuffer to a base64 string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert a hex string to an ArrayBuffer.
 */
export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Convert an ArrayBuffer to a hex string.
 */
export function arrayBufferToHex(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

// ─── Frontmatter Utilities ───────────────────────────────────────────────────────

/**
 * Parse frontmatter aliases from a CachedMetadata frontmatter object.
 * Returns an array of alias strings, or null.
 */
export function parseFrontMatterAliases(frontmatter: Record<string, unknown> | null): string[] | null {
  if (!frontmatter) return null;
  const aliases = frontmatter['aliases'] ?? frontmatter['alias'];
  if (!aliases) return null;
  if (Array.isArray(aliases)) return aliases.map(String);
  if (typeof aliases === 'string') return aliases.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
  return null;
}

// ─── Tooltip Utility ─────────────────────────────────────────────────────────────

/**
 * Attach a tooltip to an element that shows on hover.
 * Obsidian uses this for hover tooltips on UI elements.
 */
export function setTooltip(el: HTMLElement, tooltip: string, options?: { placement?: string; delay?: number }): void {
  el.setAttribute('aria-label', tooltip);
  // Obsidian renders tooltips itself from aria-label and never sets `title`;
  // Slatebase does the same via GlobalTooltip. Setting `title` as well produced
  // two overlapping tooltips — the browser's native one and ours.
  el.removeAttribute('title');
  if (options?.placement) el.setAttribute('data-tooltip-position', options.placement);
}

/**
 * Manually trigger a tooltip to appear over an element.
 */
export function displayTooltip(targetEl: HTMLElement, content: string, options?: { placement?: string }): void {
  setTooltip(targetEl, content, options);
}

// ─── Heading Utilities ───────────────────────────────────────────────────────────

/**
 * Normalize a heading string for link matching.
 * Strips special characters and collapses spaces.
 */
export function stripHeading(heading: string): string {
  return heading
    .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Prepare a heading for use in a link.
 * Strips problematic characters that could break links.
 */
export function stripHeadingForLink(heading: string): string {
  return heading
    .replace(/[#|^[\]\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Registration Function ───────────────────────────────────────────────────────

/**
 * Register all API extensions onto window.obsidian and global scope.
 * Call this AFTER the base shims in setting-tab.ts have been registered.
 */
export function registerObsidianApiExtensions(): void {
  if (typeof window === 'undefined') return;
  const obs = window.obsidian as Record<string, unknown> | undefined;
  if (!obs) return;

  // Icon functions
  if (!obs['addIcon']) obs['addIcon'] = addIcon;
  if (!obs['removeIcon']) obs['removeIcon'] = removeIcon;
  if (!obs['getIcon']) obs['getIcon'] = getIcon;
  if (!obs['getIconIds']) obs['getIconIds'] = getIconIds;
  if (!obs['setIcon']) obs['setIcon'] = setIcon;

  // Events class
  if (!obs['Events']) obs['Events'] = Events;

  // Scope & Keymap
  if (!obs['Scope']) obs['Scope'] = Scope;
  if (!obs['Keymap']) obs['Keymap'] = Keymap;

  // Utility functions
  if (!obs['parseYaml']) obs['parseYaml'] = parseYaml;
  if (!obs['stringifyYaml']) obs['stringifyYaml'] = stringifyYaml;
  if (!obs['getAllTags']) obs['getAllTags'] = getAllTags;
  if (!obs['parseLinktext']) obs['parseLinktext'] = parseLinktext;
  if (!obs['getLinkpath']) obs['getLinkpath'] = getLinkpath;
  if (!obs['htmlToMarkdown']) obs['htmlToMarkdown'] = htmlToMarkdown;
  if (!obs['sanitizeHTMLToDom']) obs['sanitizeHTMLToDom'] = sanitizeHTMLToDom;
  if (!obs['getFrontMatterInfo']) obs['getFrontMatterInfo'] = getFrontMatterInfo;
  if (!obs['parseFrontMatterEntry']) obs['parseFrontMatterEntry'] = parseFrontMatterEntry;
  if (!obs['parseFrontMatterStringArray']) obs['parseFrontMatterStringArray'] = parseFrontMatterStringArray;
  if (!obs['prepareFuzzySearch']) obs['prepareFuzzySearch'] = prepareFuzzySearch;
  if (!obs['prepareSimpleSearch']) obs['prepareSimpleSearch'] = prepareSimpleSearch;
  if (!obs['fuzzySearch']) obs['fuzzySearch'] = fuzzySearch;
  if (!obs['sortSearchResults']) obs['sortSearchResults'] = sortSearchResults;
  if (!obs['renderResults']) obs['renderResults'] = renderResults;
  if (!obs['renderMatches']) obs['renderMatches'] = renderMatches;

  // Subpath resolution
  if (!obs['resolveSubpath']) obs['resolveSubpath'] = resolveSubpath;

  // Blob / async module loaders
  if (!obs['getBlobArrayBuffer']) obs['getBlobArrayBuffer'] = getBlobArrayBuffer;
  if (!obs['loadMermaid']) obs['loadMermaid'] = loadMermaid;
  registerUnsupportedLoaders(obs);

  // Encoding utilities
  if (!obs['arrayBufferToBase64']) obs['arrayBufferToBase64'] = arrayBufferToBase64;
  if (!obs['base64ToArrayBuffer']) obs['base64ToArrayBuffer'] = base64ToArrayBuffer;
  if (!obs['hexToArrayBuffer']) obs['hexToArrayBuffer'] = hexToArrayBuffer;
  if (!obs['arrayBufferToHex']) obs['arrayBufferToHex'] = arrayBufferToHex;

  // Frontmatter utilities
  if (!obs['parseFrontMatterAliases']) obs['parseFrontMatterAliases'] = parseFrontMatterAliases;

  // Heading utilities
  if (!obs['stripHeading']) obs['stripHeading'] = stripHeading;
  if (!obs['stripHeadingForLink']) obs['stripHeadingForLink'] = stripHeadingForLink;

  // Tooltip utilities
  if (!obs['setTooltip']) obs['setTooltip'] = setTooltip;
  if (!obs['displayTooltip']) obs['displayTooltip'] = displayTooltip;

  // UI Components
  if (!obs['ExtraButtonComponent']) obs['ExtraButtonComponent'] = ExtraButtonComponent;
  if (!obs['ColorComponent']) obs['ColorComponent'] = ColorComponent;
  if (!obs['SearchComponent']) obs['SearchComponent'] = SearchComponent;
  if (!obs['MomentFormatComponent']) obs['MomentFormatComponent'] = MomentFormatComponent;
  if (!obs['ProgressBarComponent']) obs['ProgressBarComponent'] = ProgressBarComponent;
  if (!obs['AbstractInputSuggest']) {
    const PopoverSuggestClass = obs['PopoverSuggest'] as PopoverSuggestBase | undefined;
    if (PopoverSuggestClass) {
      obs['AbstractInputSuggest'] = createAbstractInputSuggestClass(PopoverSuggestClass);
    }
  }

  // MarkdownPreviewRenderer
  if (!obs['MarkdownPreviewRenderer']) obs['MarkdownPreviewRenderer'] = MarkdownPreviewRenderer;

  // EditableFileView — alias to FileView (abstract intermediate)
  if (!obs['EditableFileView']) obs['EditableFileView'] = obs['FileView'];

  // apiVersion string
  if (!obs['apiVersion']) obs['apiVersion'] = OBSIDIAN_API_VERSION;

  // Global DOM helpers
  const win = window as unknown as Record<string, unknown>;
  if (!win['createEl']) win['createEl'] = createEl;
  if (!win['createDiv']) win['createDiv'] = createDiv;
  if (!win['createSpan']) win['createSpan'] = createSpan;
  if (!win['createFragment']) win['createFragment'] = createFragment;

  // Install DOM prototype extensions
  installDomExtensions();
}

// ─── DOM Prototype Extensions ────────────────────────────────────────────────────

/**
 * Install Obsidian's DOM prototype extensions on Node, Element, HTMLElement.
 * These are used by many plugins for DOM manipulation.
 */
function installDomExtensions(): void {
  // Node.createEl
  if (!('createEl' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'createEl', {
      value: function (this: Node, tag: string, o?: unknown, callback?: (el: HTMLElement) => void): HTMLElement {
        const el = createEl(tag as keyof HTMLElementTagNameMap, o as string | undefined, callback);
        this.appendChild(el);
        return el;
      },
      writable: true,
      configurable: true,
    });
  }

  // Node.createDiv
  if (!('createDiv' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'createDiv', {
      value: function (this: Node, o?: unknown, callback?: (el: HTMLDivElement) => void): HTMLDivElement {
        const el = createDiv(o as string | undefined, callback);
        this.appendChild(el);
        return el;
      },
      writable: true,
      configurable: true,
    });
  }

  // Node.createSpan
  if (!('createSpan' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'createSpan', {
      value: function (this: Node, o?: unknown, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement {
        const el = createSpan(o as string | undefined, callback);
        this.appendChild(el);
        return el;
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.addClass / addClasses
  if (!('addClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'addClass', {
      value: function (this: Element, ...classes: string[]): void {
        this.classList.add(...classes);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!('addClasses' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'addClasses', {
      value: function (this: Element, classes: string[]): void {
        this.classList.add(...classes);
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.removeClass / removeClasses
  if (!('removeClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'removeClass', {
      value: function (this: Element, ...classes: string[]): void {
        this.classList.remove(...classes);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!('removeClasses' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'removeClasses', {
      value: function (this: Element, classes: string[]): void {
        this.classList.remove(...classes);
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.toggleClass
  if (!('toggleClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'toggleClass', {
      value: function (this: Element, classes: string | string[], value: boolean): void {
        const list = Array.isArray(classes) ? classes : [classes];
        for (const cls of list) this.classList.toggle(cls, value);
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.hasClass
  if (!('hasClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'hasClass', {
      value: function (this: Element, cls: string): boolean {
        return this.classList.contains(cls);
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.setText / getText
  if (!('setText' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'setText', {
      value: function (this: Element, val: string): void {
        this.textContent = val;
      },
      writable: true,
      configurable: true,
    });
  }

  if (!('getText' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'getText', {
      value: function (this: Element): string {
        return this.textContent ?? '';
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.setAttr / setAttrs / getAttr
  if (!('setAttr' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'setAttr', {
      value: function (this: Element, name: string, value: string | number | boolean | null): void {
        if (value === null || value === undefined) this.removeAttribute(name);
        else this.setAttribute(name, String(value));
      },
      writable: true,
      configurable: true,
    });
  }

  if (!('setAttrs' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'setAttrs', {
      value: function (this: Element, obj: Record<string, string | number | boolean | null>): void {
        for (const [k, v] of Object.entries(obj)) {
          if (v === null || v === undefined) this.removeAttribute(k);
          else this.setAttribute(k, String(v));
        }
      },
      writable: true,
      configurable: true,
    });
  }

  if (!('getAttr' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'getAttr', {
      value: function (this: Element, name: string): string | null {
        return this.getAttribute(name);
      },
      writable: true,
      configurable: true,
    });
  }

  // HTMLElement.show / hide / toggle
  if (!('show' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'show', {
      value: function (this: HTMLElement): void { this.style.display = ''; },
      writable: true,
      configurable: true,
    });
  }

  if (!('hide' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'hide', {
      value: function (this: HTMLElement): void { this.style.display = 'none'; },
      writable: true,
      configurable: true,
    });
  }

  if (!('toggle' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'toggle', {
      value: function (this: HTMLElement, show: boolean): void {
        this.style.display = show ? '' : 'none';
      },
      writable: true,
      configurable: true,
    });
  }

  // Node.detach (remove from parent)
  if (!('detach' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'detach', {
      value: function (this: Node): void { this.parentNode?.removeChild(this); },
      writable: true,
      configurable: true,
    });
  }

  // Node.empty (remove all children)
  if (!('empty' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'empty', {
      value: function (this: Node): void { while (this.firstChild) this.removeChild(this.firstChild); },
      writable: true,
      configurable: true,
    });
  }

  // Node.appendText (append a text node)
  if (!('appendText' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'appendText', {
      value: function (this: Node, val: string): void {
        this.appendChild(document.createTextNode(val));
      },
      writable: true,
      configurable: true,
    });
  }

  // Element.find / findAll
  if (!('find' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'find', {
      value: function (this: Element, selector: string): Element | null {
        return this.querySelector(selector);
      },
      writable: true,
      configurable: true,
    });
  }

  if (!('findAll' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'findAll', {
      value: function (this: Element, selector: string): HTMLElement[] {
        return Array.from(this.querySelectorAll(selector));
      },
      writable: true,
      configurable: true,
    });
  }
}
