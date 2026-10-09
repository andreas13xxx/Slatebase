/**
 * Bases `Value` type hierarchy — functional implementations.
 *
 * Obsidian's Bases query results wrap every cell value in a `Value` object
 * (API since 1.10.0): `StringValue`, `NumberValue`, `BooleanValue`,
 * `DateValue`, `ListValue`, `LinkValue`, … all extend an abstract `Value`
 * with `toString()`, `isTruthy()`, `equals()`, `looseEquals()` and
 * `renderTo(el, ctx)`. A plugin-contributed Bases view receives these objects
 * and renders/compares them itself, so they must actually work rather than be
 * inert stubs.
 *
 * This module owns the concrete classes; `install-globals.ts` assigns them
 * onto `window.obsidian` (same first-writer-wins guard as the rest of the
 * namespace). The `bases-value-factory.ts` wraps raw link-index values into
 * the right subclass. Rendering stays XSS-safe: `HTMLValue.renderTo()` routes
 * through the shared `sanitizeHTMLToDom` sanitizer, and `LinkValue` builds a
 * real anchor element with its text set via `textContent`, never `innerHTML`.
 *
 * @module bases-values
 */

import { sanitizeHTMLToDom } from './obsidian-api-extensions'

/**
 * Context passed to `renderTo()` — Obsidian's `RenderContext implements
 * HoverParent`. We also carry an optional `onOpenNote` so a `LinkValue` can
 * navigate when the host provides it; real plugins only read `hoverPopover`,
 * so the extra field is additive and harmless.
 */
export interface BasesRenderContext {
  hoverPopover?: unknown
  /** Optional navigation callback the host wires in, so links are clickable. */
  onOpenNote?: (path: string) => void
}

/** Loosely compares two scalars after string coercion (case-insensitive). */
function looseScalarEquals(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return String(a).toLowerCase() === String(b).toLowerCase()
}

/** Abstract base of the whole Value hierarchy. */
export abstract class Value {
  value: unknown
  constructor(value?: unknown) { this.value = value }

  toString(): string { return this.value == null ? '' : String(this.value) }
  isTruthy(): boolean { return !!this.value }
  equals(other: unknown): boolean {
    return other instanceof Value && Object.is(this.value, other.value)
  }
  looseEquals(other: unknown): boolean {
    if (other instanceof Value) return looseScalarEquals(this.value, other.value)
    return looseScalarEquals(this.value, other)
  }
  renderTo(el: HTMLElement, _ctx?: BasesRenderContext): void {
    el.textContent = this.toString()
  }

  static type = 'value'
  static equals(a: unknown, b: unknown): boolean {
    if (a instanceof Value) return a.equals(b)
    return Object.is(a, b)
  }
  static looseEquals(a: unknown, b: unknown): boolean {
    if (a instanceof Value) return a.looseEquals(b)
    return looseScalarEquals(a, b)
  }
}

/** A value that is never null (base of all concrete non-null types). */
export class NotNullValue extends Value {}

/** The singleton null/empty result. `NullValue.value` is the shared instance. */
export class NullValue extends Value {
  constructor() { super(null) }
  toString(): string { return '' }
  isTruthy(): boolean { return false }
  equals(other: unknown): boolean { return other instanceof NullValue }
  looseEquals(other: unknown): boolean {
    if (other instanceof NullValue) return true
    if (other instanceof Value) return other.value == null
    return other == null
  }
  renderTo(el: HTMLElement): void { el.textContent = '' }
  static value: NullValue = new NullValue()
}

/** Scalar wrapper (string/number/boolean). */
export class PrimitiveValue extends NotNullValue {}

/** Boolean value. Renders a checkbox-like glyph. */
export class BooleanValue extends PrimitiveValue {
  isTruthy(): boolean { return this.value === true }
  toString(): string { return this.value === true ? 'true' : 'false' }
  renderTo(el: HTMLElement): void { el.textContent = this.value === true ? '✓' : '✗' }
}

/** Number value. */
export class NumberValue extends PrimitiveValue {
  isTruthy(): boolean { return typeof this.value === 'number' && this.value !== 0 }
  toString(): string {
    return typeof this.value === 'number' && Number.isFinite(this.value) ? String(this.value) : ''
  }
}

/** String value. */
export class StringValue extends PrimitiveValue {
  isTruthy(): boolean { return typeof this.value === 'string' && this.value.length > 0 }
}

/** HTML-valued cell. Renders through the shared sanitizer — never raw innerHTML. */
export class HTMLValue extends StringValue {
  renderTo(el: HTMLElement, _ctx?: BasesRenderContext): void {
    el.textContent = ''
    el.appendChild(sanitizeHTMLToDom(this.toString()))
  }
}

/** Icon name value. Rendered as plain text (icon resolution is a host concern). */
export class IconValue extends StringValue {}

/** Image URL value. Rendered as an `<img>` with a sanitized src. */
export class ImageValue extends StringValue {
  renderTo(el: HTMLElement): void {
    const src = this.toString()
    if (!isSafeUrl(src)) { el.textContent = src; return }
    el.textContent = ''
    const img = el.ownerDocument.createElement('img')
    img.src = src
    img.alt = ''
    el.appendChild(img)
  }
}

/** Internal wikilink value. Renders a clickable internal link when the host supplies navigation. */
export class LinkValue extends StringValue {
  /** Resolved vault-relative path (set by the factory when known). */
  path?: string
  /** Display text (falls back to the link target). */
  displayText?: string

  toString(): string { return this.displayText ?? String(this.value ?? '') }

  renderTo(el: HTMLElement, ctx?: BasesRenderContext): void {
    el.textContent = ''
    const a = el.ownerDocument.createElement('a')
    a.className = 'internal-link'
    a.textContent = this.toString()
    const target = this.path ?? String(this.value ?? '')
    a.setAttribute('href', '#')
    a.dataset['href'] = target
    const onOpen = ctx?.onOpenNote
    if (onOpen && target) {
      a.addEventListener('click', (e) => { e.preventDefault(); onOpen(target) })
    }
    el.appendChild(a)
  }
}

/** Tag value. */
export class TagValue extends StringValue {
  toString(): string {
    const raw = String(this.value ?? '')
    return raw.startsWith('#') ? raw : `#${raw}`
  }
}

/** External URL value. Renders a safe anchor; blocks javascript: and other schemes. */
export class UrlValue extends StringValue {
  renderTo(el: HTMLElement): void {
    const url = String(this.value ?? '')
    el.textContent = ''
    if (!isSafeUrl(url)) { el.textContent = url; return }
    const a = el.ownerDocument.createElement('a')
    a.href = url
    a.textContent = url
    a.rel = 'noopener noreferrer'
    a.target = '_blank'
    el.appendChild(a)
  }
}

/** Date / datetime value. Formats a parsed date; falls back to the raw string. */
export class DateValue extends NotNullValue {
  toString(): string {
    const raw = String(this.value ?? '')
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    // Date-only (no time component) → date; otherwise date + time, locale-formatted.
    const hasTime = /T\d{2}:\d{2}/.test(raw)
    return hasTime ? d.toLocaleString() : d.toLocaleDateString()
  }
  isTruthy(): boolean { return this.value != null && this.value !== '' }
}

/** Relative date (e.g. "in 3 days"). We render the absolute string as a safe default. */
export class RelativeDateValue extends DateValue {}

/** Duration value. */
export class DurationValue extends NotNullValue {}

/** File reference value. */
export class FileValue extends NotNullValue {}

/** List/array value. Renders items comma-separated. */
export class ListValue extends NotNullValue {
  constructor(value?: unknown) {
    super(Array.isArray(value) ? value : value == null ? [] : [value])
  }
  private items(): unknown[] { return Array.isArray(this.value) ? this.value : [] }
  toString(): string {
    return this.items().map((v) => (v instanceof Value ? v.toString() : String(v))).join(', ')
  }
  isTruthy(): boolean { return this.items().length > 0 }
  renderTo(el: HTMLElement, ctx?: BasesRenderContext): void {
    el.textContent = ''
    const items = this.items()
    items.forEach((item, i) => {
      if (i > 0) el.appendChild(el.ownerDocument.createTextNode(', '))
      if (item instanceof Value) {
        const span = el.ownerDocument.createElement('span')
        item.renderTo(span, ctx)
        el.appendChild(span)
      } else {
        el.appendChild(el.ownerDocument.createTextNode(String(item)))
      }
    })
  }
}

/** Object/record value. */
export class ObjectValue extends NotNullValue {
  toString(): string {
    try { return JSON.stringify(this.value) } catch { return String(this.value) }
  }
}

/** Regular-expression value. */
export class RegExpValue extends NotNullValue {}

/**
 * URL-scheme allowlist for anchor/img rendering — the same posture as the rest
 * of the untrusted-content path (http/https/mailto/relative; everything else,
 * incl. `javascript:`, is rejected). Whitespace/control chars are stripped
 * before the scheme check to defeat `java\tscript:` bypasses.
 */
function isSafeUrl(url: string): boolean {
  // Strip control chars + whitespace before the scheme check — a `java\tscript:`
  // style bypass is exactly what this defends against, so matching control
  // characters here is intentional (see quality.md "Untrusted Content Rendering").
  // eslint-disable-next-line no-control-regex
  const cleaned = url.replace(/[\u0000-\u001f\u007f-\u009f\s]/g, '').toLowerCase()
  if (cleaned === '') return false
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('mailto:')) return true
  // Relative URLs (no scheme) are allowed; anything with a scheme is not.
  return !/^[a-z][a-z0-9+.-]*:/.test(cleaned)
}

/**
 * The full set of Value classes keyed by their Obsidian name, for one-shot
 * assignment onto `window.obsidian`. Named via `name` property so devtools and
 * `instanceof`-adjacent debugging show the real class name.
 */
export const BASES_VALUE_CLASSES: Record<string, unknown> = {
  Value, NotNullValue, NullValue, PrimitiveValue,
  BooleanValue, NumberValue, StringValue,
  HTMLValue, IconValue, ImageValue, LinkValue, TagValue, UrlValue,
  DateValue, RelativeDateValue, DurationValue, FileValue, ListValue, ObjectValue, RegExpValue,
}
