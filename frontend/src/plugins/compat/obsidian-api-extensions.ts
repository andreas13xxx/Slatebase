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
 * Checks custom icons first, then falls back to null.
 */
export function getIcon(iconId: string): SVGSVGElement | null {
  const svg = customIcons.get(iconId);
  if (svg) {
    const container = document.createElement('div');
    container.innerHTML = svg;
    const svgEl = container.querySelector('svg');
    return svgEl ?? null;
  }
  return null;
}

/**
 * Get the list of registered custom icon IDs.
 */
export function getIconIds(): string[] {
  return Array.from(customIcons.keys());
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
  // Fallback: create a placeholder SVG with the icon name as data attr
  const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  placeholder.setAttribute('data-icon', iconId);
  placeholder.setAttribute('width', '16');
  placeholder.setAttribute('height', '16');
  placeholder.setAttribute('viewBox', '0 0 24 24');
  placeholder.setAttribute('fill', 'none');
  placeholder.setAttribute('stroke', 'currentColor');
  placeholder.setAttribute('stroke-width', '2');
  parent.appendChild(placeholder);
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
      try { callback.apply(ctx, data); } catch (e) { console.error('[Events] Handler error:', e); }
    }
  }

  tryTrigger(_evt: unknown, _args: unknown[]): void {
    // No-op — internal Obsidian method
  }
}

// ─── Scope & Keymap ──────────────────────────────────────────────────────────────

/**
 * Scope — Handles keyboard events with registered hotkeys.
 * Used by Modals and suggest popups for keyboard navigation.
 */
export class Scope {
  private handlers: Array<{ modifiers: string[] | null; key: string | null; func: (...args: unknown[]) => unknown }> = [];

  constructor(_parent?: Scope) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  register(modifiers: string[] | null, key: string | null, func: (...args: unknown[]) => unknown): { modifiers: string[] | null; key: string | null; func: (...args: unknown[]) => unknown } {
    const handler = { modifiers, key, func };
    this.handlers.push(handler);
    return handler;
  }

  unregister(handler: { modifiers: string[] | null; key: string | null; func: (...args: unknown[]) => unknown }): void {
    const idx = this.handlers.indexOf(handler);
    if (idx >= 0) this.handlers.splice(idx, 1);
  }
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

  pushScope(_scope: Scope): void {}
  popScope(_scope: Scope): void {}
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
    el.textContent = o;
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
  inputEl: HTMLInputElement;
  clearButtonEl: HTMLElement;
  private _callback: ((value: string) => void) | null = null;

  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'search';
    this.inputEl.className = 'search-input';
    this.clearButtonEl = document.createElement('div');
    this.clearButtonEl.className = 'search-input-clear-button';
    containerEl.appendChild(this.inputEl);
    containerEl.appendChild(this.clearButtonEl);
    this.inputEl.addEventListener('input', () => {
      if (this._callback) this._callback(this.inputEl.value);
    });
    this.clearButtonEl.addEventListener('click', () => {
      this.inputEl.value = '';
      if (this._callback) this._callback('');
    });
  }

  getValue(): string { return this.inputEl.value; }
  setValue(value: string): this { this.inputEl.value = value; return this; }
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
 */
export class AbstractInputSuggest {
  app: unknown;
  textInputEl: HTMLInputElement | HTMLDivElement;
  limit = 100;
  private _selectCallback: ((value: unknown, evt: MouseEvent | KeyboardEvent) => void) | null = null;

  constructor(app: unknown, textInputEl: HTMLInputElement | HTMLDivElement) {
    this.app = app;
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

  open(): void {}
  close(): void {}
  getSuggestions(_query: string): unknown[] { return []; }
  renderSuggestion(_value: unknown, _el: HTMLElement): void {}
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
export function setTooltip(el: HTMLElement, tooltip: string, _options?: { placement?: string; delay?: number }): void {
  el.setAttribute('aria-label', tooltip);
  el.title = tooltip;
}

/**
 * Manually trigger a tooltip to appear over an element.
 */
export function displayTooltip(targetEl: HTMLElement, content: string, _options?: { placement?: string }): void {
  targetEl.setAttribute('aria-label', content);
  targetEl.title = content;
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
  if (!obs['AbstractInputSuggest']) obs['AbstractInputSuggest'] = AbstractInputSuggest;

  // MarkdownPreviewRenderer
  if (!obs['MarkdownPreviewRenderer']) obs['MarkdownPreviewRenderer'] = MarkdownPreviewRenderer;

  // EditableFileView — alias to FileView (abstract intermediate)
  if (!obs['EditableFileView']) obs['EditableFileView'] = obs['FileView'];

  // apiVersion string
  if (!obs['apiVersion']) obs['apiVersion'] = '1.4.0';

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
