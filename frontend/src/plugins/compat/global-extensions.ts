/**
 * Global Prototype Extensions — Obsidian-compatible global patches.
 *
 * Obsidian patches Array, String, Math, Object, Element, HTMLElement, and Node
 * prototypes with utility methods that many plugins use directly.
 *
 * This file MUST be imported synchronously before any plugin bundles evaluate.
 * It is imported by setting-tab.ts as a side-effect.
 *
 * Methods added:
 * - Array: first, last, contains, remove, shuffle, unique, findLastIndex
 * - String: contains
 * - Math: clamp, square
 * - Object: isEmpty, each
 * - Element: find, findAll, findAllSelf, matchParent, getCssPropertyValue, isActiveElement
 * - HTMLElement: isShown, toggle, toggleVisibility, trigger
 * - Node: insertAfter, indexOf, setChildrenInPlace
 * - Global: createSvg, fish, fishAll
 *
 * @module global-extensions
 */

// ─── Array Extensions ────────────────────────────────────────────────────────

if (!('first' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'first', {
    value: function <T>(this: T[]): T | undefined {
      return this[0]
    },
    writable: true,
    configurable: true,
  })
}

if (!('last' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'last', {
    value: function <T>(this: T[]): T | undefined {
      return this[this.length - 1]
    },
    writable: true,
    configurable: true,
  })
}

if (!('contains' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'contains', {
    value: function <T>(this: T[], target: T): boolean {
      return this.indexOf(target) !== -1
    },
    writable: true,
    configurable: true,
  })
}

if (!('remove' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'remove', {
    value: function <T>(this: T[], target: T): void {
      const idx = this.indexOf(target)
      if (idx !== -1) this.splice(idx, 1)
    },
    writable: true,
    configurable: true,
  })
}

if (!('shuffle' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'shuffle', {
    value: function <T>(this: T[]): T[] {
      for (let i = this.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = this[i]
        this[i] = this[j]!
        this[j] = temp!
      }
      return this
    },
    writable: true,
    configurable: true,
  })
}

if (!('unique' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'unique', {
    value: function <T>(this: T[]): T[] {
      return [...new Set(this)]
    },
    writable: true,
    configurable: true,
  })
}

// findLastIndex is native in modern JS but some environments may not have it
if (!('findLastIndex' in Array.prototype)) {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function <T>(this: T[], predicate: (value: T) => boolean): number {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate(this[i]!)) return i
      }
      return -1
    },
    writable: true,
    configurable: true,
  })
}

// ─── String Extensions ───────────────────────────────────────────────────────

if (!('contains' in String.prototype)) {
  Object.defineProperty(String.prototype, 'contains', {
    value: function (this: string, target: string): boolean {
      return this.indexOf(target) !== -1
    },
    writable: true,
    configurable: true,
  })
}

// ─── Math Extensions ─────────────────────────────────────────────────────────

if (!('clamp' in Math)) {
  Object.defineProperty(Math, 'clamp', {
    value: function (value: number, min: number, max: number): number {
      return Math.min(Math.max(value, min), max)
    },
    writable: true,
    configurable: true,
  })
}

if (!('square' in Math)) {
  Object.defineProperty(Math, 'square', {
    value: function (value: number): number {
      return value * value
    },
    writable: true,
    configurable: true,
  })
}

// ─── Object Extensions ───────────────────────────────────────────────────────

if (!('isEmpty' in Object)) {
  Object.defineProperty(Object, 'isEmpty', {
    value: function (object: Record<string, unknown>): boolean {
      for (const _key in object) return false
      return true
    },
    writable: true,
    configurable: true,
  })
}

if (!('each' in Object)) {
  Object.defineProperty(Object, 'each', {
    value: function <T>(
      object: { [key: string]: T },
      callback: (value: T, key?: string) => boolean | void,
      _context?: unknown,
    ): boolean {
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          if (callback(object[key]!, key) === false) return false
        }
      }
      return true
    },
    writable: true,
    configurable: true,
  })
}

// ─── Element Extensions ──────────────────────────────────────────────────────

if (!('find' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'find', {
    value: function (this: Element, selector: string): Element | null {
      return this.querySelector(selector)
    },
    writable: true,
    configurable: true,
  })
}

if (!('findAll' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'findAll', {
    value: function (this: Element, selector: string): HTMLElement[] {
      return Array.from(this.querySelectorAll(selector)) as HTMLElement[]
    },
    writable: true,
    configurable: true,
  })
}

if (!('findAllSelf' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'findAllSelf', {
    value: function (this: Element, selector: string): HTMLElement[] {
      const result: HTMLElement[] = []
      if (this.matches(selector)) result.push(this as HTMLElement)
      result.push(...(Array.from(this.querySelectorAll(selector)) as HTMLElement[]))
      return result
    },
    writable: true,
    configurable: true,
  })
}

if (!('matchParent' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'matchParent', {
    value: function (this: Element, selector: string, lastParent?: Element): Element | null {
      const limit = lastParent ?? document.body
      let el: Element | null = this.parentElement
      while (el && el !== limit) {
        if (el.matches(selector)) return el
        el = el.parentElement
      }
      return null
    },
    writable: true,
    configurable: true,
  })
}

if (!('getCssPropertyValue' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'getCssPropertyValue', {
    value: function (this: Element, property: string, pseudoElement?: string): string {
      return getComputedStyle(this, pseudoElement ?? null).getPropertyValue(property)
    },
    writable: true,
    configurable: true,
  })
}

if (!('isActiveElement' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'isActiveElement', {
    value: function (this: Element): boolean {
      return document.activeElement === this
    },
    writable: true,
    configurable: true,
  })
}

// ─── HTMLElement Extensions ──────────────────────────────────────────────────

if (!('isShown' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'isShown', {
    value: function (this: HTMLElement): boolean {
      return this.offsetParent !== null || this.getClientRects().length > 0
    },
    writable: true,
    configurable: true,
  })
}

if (!('toggle' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'toggle', {
    value: function (this: HTMLElement, show: boolean): void {
      this.style.display = show ? '' : 'none'
    },
    writable: true,
    configurable: true,
  })
}

if (!('toggleVisibility' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'toggleVisibility', {
    value: function (this: HTMLElement, visible: boolean): void {
      this.style.display = visible ? '' : 'none'
    },
    writable: true,
    configurable: true,
  })
}

if (!('trigger' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'trigger', {
    value: function (this: HTMLElement, eventType: string): void {
      this.dispatchEvent(new Event(eventType, { bubbles: true }))
    },
    writable: true,
    configurable: true,
  })
}

// ─── Node Extensions ─────────────────────────────────────────────────────────

if (!('insertAfter' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'insertAfter', {
    value: function <T extends Node>(this: Node, node: T, child: Node | null): T {
      if (child === null) {
        this.insertBefore(node, this.firstChild)
      } else {
        this.insertBefore(node, child.nextSibling)
      }
      return node
    },
    writable: true,
    configurable: true,
  })
}

if (!('indexOf' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'indexOf', {
    value: function (this: Node, other: Node): number {
      const children = this.childNodes
      for (let i = 0; i < children.length; i++) {
        if (children[i] === other) return i
      }
      return -1
    },
    writable: true,
    configurable: true,
  })
}

if (!('setChildrenInPlace' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'setChildrenInPlace', {
    value: function (this: Node, children: Node[]): void {
      while (this.firstChild) this.removeChild(this.firstChild)
      for (const child of children) this.appendChild(child)
    },
    writable: true,
    configurable: true,
  })
}

// ─── DocumentFragment Extensions ─────────────────────────────────────────────

if (!('find' in DocumentFragment.prototype)) {
  Object.defineProperty(DocumentFragment.prototype, 'find', {
    value: function (this: DocumentFragment, selector: string): HTMLElement | null {
      return this.querySelector(selector) as HTMLElement | null
    },
    writable: true,
    configurable: true,
  })
}

if (!('findAll' in DocumentFragment.prototype)) {
  Object.defineProperty(DocumentFragment.prototype, 'findAll', {
    value: function (this: DocumentFragment, selector: string): HTMLElement[] {
      return Array.from(this.querySelectorAll(selector)) as HTMLElement[]
    },
    writable: true,
    configurable: true,
  })
}

// ─── Global Functions ────────────────────────────────────────────────────────

const win = window as unknown as Record<string, unknown>

/** createSvg — Create an SVG element. */
if (!win['createSvg']) {
  win['createSvg'] = function <K extends keyof SVGElementTagNameMap>(
    tag: K,
    o?: { cls?: string | string[]; attr?: Record<string, string | number | boolean | null>; parent?: Node; prepend?: boolean } | string,
    callback?: (el: SVGElementTagNameMap[K]) => void,
  ): SVGElementTagNameMap[K] {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
    if (typeof o === 'string') {
      el.textContent = o
    } else if (o) {
      if (o.cls) {
        if (Array.isArray(o.cls)) el.setAttribute('class', o.cls.join(' '))
        else el.setAttribute('class', o.cls)
      }
      if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) {
          if (v !== null && v !== undefined) el.setAttribute(k, String(v))
        }
      }
      if (o.parent) {
        if (o.prepend) o.parent.insertBefore(el, o.parent.firstChild)
        else o.parent.appendChild(el)
      }
    }
    if (callback) callback(el)
    return el
  }
}

/** fish — global querySelector shorthand. */
if (!win['fish']) {
  win['fish'] = function (selector: string): HTMLElement | null {
    return document.querySelector(selector) as HTMLElement | null
  }
}

/** fishAll — global querySelectorAll shorthand. */
if (!win['fishAll']) {
  win['fishAll'] = function (selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[]
  }
}

// ─── Number / String static extensions ───────────────────────────────────────

if (!('isString' in String)) {
  Object.defineProperty(String, 'isString', {
    value: function (obj: unknown): obj is string {
      return typeof obj === 'string'
    },
    writable: true,
    configurable: true,
  })
}

if (!('isNumber' in Number)) {
  Object.defineProperty(Number, 'isNumber', {
    value: function (obj: unknown): obj is number {
      return typeof obj === 'number'
    },
    writable: true,
    configurable: true,
  })
}

// ─── Array static extensions ─────────────────────────────────────────────────

if (!('combine' in Array)) {
  Object.defineProperty(Array, 'combine', {
    value: function <T>(arrays: T[][]): T[] {
      return ([] as T[]).concat(...arrays)
    },
    writable: true,
    configurable: true,
  })
}
