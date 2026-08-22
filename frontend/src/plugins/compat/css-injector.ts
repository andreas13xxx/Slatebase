/**
 * CSS Injector — Scoped CSS injection for Obsidian plugin compatibility.
 *
 * Injects plugin CSS into <style> elements with data-plugin-id attributes.
 * All selectors are scoped with [data-plugin-id="<pluginId>"] to prevent
 * style leakage between plugins and the host application.
 *
 * The one deliberate exception is Obsidian's host marker classes
 * (`theme-dark`, `is-mobile`, `mod-macos`, …). Those sit on `<body>`, so a
 * plugin rule that leads with one is addressing the host *and* its own element,
 * and the scope has to go after the host part rather than merge into it — see
 * splitHostPrefix().
 */

import { OBSIDIAN_HOST_BODY_CLASSES } from './body-classes';

/** Maximum allowed CSS size in bytes (512 KB). */
const MAX_CSS_SIZE_BYTES = 512 * 1024;

/**
 * ICssInjector — Interface for CSS injection and removal.
 */
export interface ICssInjector {
  inject(pluginId: string, css: string): void;
  remove(pluginId: string): void;
}

/**
 * Scope CSS selectors by prefixing them with [data-plugin-id="<pluginId>"].
 *
 * Handles:
 * - Regular selectors
 * - Grouped selectors (a, b { })
 * - @media rules (prefixes selectors inside)
 * - Skips @keyframes and @font-face (these shouldn't be scoped)
 * - :root selector → replaced with [data-plugin-id="..."]
 */
export function scopeCss(css: string, pluginId: string): string {
  const scope = `[data-plugin-id="${pluginId}"]`;
  return processBlock(css, scope, false);
}

/**
 * Process a CSS block, scoping selectors while respecting at-rules.
 */
function processBlock(css: string, scope: string, _insideScopedAtRule: boolean): string {  
  let result = '';
  let i = 0;

  while (i < css.length) {
    // Skip whitespace
    if (isWhitespace(css[i]!)) {
      result += css[i];
      i++;
      continue;
    }

    // Skip comments
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) {
        result += css.slice(i);
        break;
      }
      result += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Detect at-rules
    if (css[i] === '@') {
      const atResult = handleAtRule(css, i, scope);
      result += atResult.output;
      i = atResult.nextIndex;
      continue;
    }

    // Regular rule: selector { declarations }
    const braceIndex = findUnquotedChar(css, '{', i);
    if (braceIndex === -1) {
      // Remaining text with no brace — output as-is
      result += css.slice(i);
      break;
    }

    const selectorText = css.slice(i, braceIndex).trim();
    const blockEnd = findMatchingBrace(css, braceIndex);
    const blockContent = css.slice(braceIndex + 1, blockEnd);

    // Scope the selector
    const scopedSelector = scopeSelector(selectorText, scope);
    result += `${scopedSelector} {${blockContent}}`;
    i = blockEnd + 1;
  }

  return result;
}

/**
 * Handle @-rules (media, keyframes, font-face, supports, etc.)
 */
function handleAtRule(css: string, startIndex: number, scope: string): { output: string; nextIndex: number } {
  // Find the end of the at-rule name/params
  const braceIndex = findUnquotedChar(css, '{', startIndex);
  const semicolonIndex = findUnquotedChar(css, ';', startIndex);

  // At-rule without block (e.g., @import, @charset)
  if (semicolonIndex !== -1 && (braceIndex === -1 || semicolonIndex < braceIndex)) {
    const ruleText = css.slice(startIndex, semicolonIndex + 1);
    return { output: ruleText, nextIndex: semicolonIndex + 1 };
  }

  if (braceIndex === -1) {
    // No brace found — output rest as-is
    return { output: css.slice(startIndex), nextIndex: css.length };
  }

  const atRuleHeader = css.slice(startIndex, braceIndex).trim();
  const blockEnd = findMatchingBrace(css, braceIndex);
  const blockContent = css.slice(braceIndex + 1, blockEnd);

  const atRuleName = extractAtRuleName(atRuleHeader);

  // Skip scoping for @keyframes and @font-face
  if (atRuleName === 'keyframes' || atRuleName === 'font-face') {
    return {
      output: `${atRuleHeader} {${blockContent}}`,
      nextIndex: blockEnd + 1,
    };
  }

  // For @media, @supports, @layer, etc. — process inner block recursively
  if (atRuleName === 'media' || atRuleName === 'supports' || atRuleName === 'layer' || atRuleName === 'container') {
    const scopedInner = processBlock(blockContent, scope, true);
    return {
      output: `${atRuleHeader} {${scopedInner}}`,
      nextIndex: blockEnd + 1,
    };
  }

  // Unknown at-rule with block — pass through without modification
  return {
    output: `${atRuleHeader} {${blockContent}}`,
    nextIndex: blockEnd + 1,
  };
}

/**
 * Extract the at-rule name from the header (e.g., "@media ..." → "media").
 */
function extractAtRuleName(header: string): string {
  // header starts with @, extract the name part
  const match = header.match(/^@(-?[a-zA-Z_][\w-]*)/);
  return match?.[1]?.toLowerCase() ?? '';
}

/**
 * Scope a selector string (may contain comma-separated selectors).
 */
function scopeSelector(selectorText: string, scope: string): string {
  if (!selectorText) return scope;

  const selectors = splitSelectors(selectorText);
  const scoped = selectors.map(sel => scopeSingleSelector(sel.trim(), scope));
  return scoped.join(', ');
}

/**
 * Split off a leading run of host marker classes, optionally on an explicit
 * `body`/`html`.
 *
 * `theme-dark`, `is-mobile`, `mod-macos` and friends live on `<body>` (see
 * body-classes.ts), never on a plugin's own element. A rule like
 * `.theme-dark .panel` therefore addresses two different elements: the host
 * body, and the plugin's element somewhere beneath it. Folding the whole thing
 * into the scope — the old behaviour — produced
 * `[data-plugin-id="x"].theme-dark .panel`, which asks one element to be both
 * at once and so matches nothing. Every plugin's dark-mode block was dead CSS.
 *
 * Returning the host part separately lets the caller keep it in front of the
 * scope, where it still refers to `<body>`.
 *
 * @returns The host prefix (`''` when there is none) and the rest of the
 *          selector, which is scoped normally.
 */
function splitHostPrefix(selector: string): { hostPrefix: string; rest: string } {
  let i = 0;

  // An explicit `body`/`html` lead is part of the host prefix, but only when
  // something host-ish follows or it is the whole lead — `body` alone keeps its
  // existing "scope the plugin's own root" meaning below.
  let sawElement = false;
  for (const tag of ['body', 'html']) {
    if (selector.startsWith(tag)) {
      const next = selector[tag.length];
      if (next === undefined || next === '.' || next === ' ' || next === '>') {
        i = tag.length;
        sawElement = true;
      }
      break;
    }
  }

  // Then any number of `.host-class` segments, chained directly.
  let sawHostClass = false;
  for (;;) {
    if (selector[i] !== '.') break;
    const match = /^\.([A-Za-z0-9_-]+)/.exec(selector.slice(i));
    const name = match?.[1];
    if (!name || !OBSIDIAN_HOST_BODY_CLASSES.includes(name)) break;
    i += match[0].length;
    sawHostClass = true;
  }

  // `body` on its own, or `body .child`, is not a host-class rule — leave those
  // to the existing body handling so plugin variables stay scoped to the plugin.
  if (!sawHostClass) return { hostPrefix: '', rest: selector };

  const rest = selector.slice(i).replace(/^[ >]+/, '');
  // `html`/`body` is implied when the rule only named the class, and stating it
  // keeps the prefix from accidentally matching a same-named plugin element.
  const prefix = sawElement ? selector.slice(0, i) : `body${selector.slice(0, i)}`;
  return { hostPrefix: prefix, rest };
}

/**
 * Scope a single selector (no commas).
 */
function scopeSingleSelector(selector: string, scope: string): string {
  if (!selector) return scope;

  // Host marker classes (theme-dark, is-mobile, …) stay in front of the scope:
  // they describe <body>, not the plugin's element. See splitHostPrefix().
  const { hostPrefix, rest: hostRest } = splitHostPrefix(selector);
  if (hostPrefix) {
    // `.theme-dark { --x: 1 }` with nothing after it sets a variable the
    // plugin's own elements should inherit, so the scope becomes the subject.
    if (!hostRest) return `${hostPrefix} ${scope}`;
    // Scoping the remainder yields both a self and a descendant form; the host
    // prefix has to go on each of them. Prefixing only the joined string would
    // leave the second alternative unguarded, so a dark-mode rule would also
    // apply in light mode — worse than the dead selector this replaced.
    return splitSelectors(scopeSingleSelector(hostRest, scope))
      .map((form) => `${hostPrefix} ${form.trim()}`)
      .join(', ');
  }

  // :root → replace with scope
  if (selector === ':root') {
    return scope;
  }

  // If selector starts with :root, replace :root portion with scope
  if (selector.startsWith(':root')) {
    return scope + selector.slice(5);
  }

  // body → replace with scope (plugin CSS variables on body should be scoped)
  if (selector === 'body') {
    return scope;
  }

  // body.class or body:pseudo → replace body portion with scope
  if (selector.startsWith('body') && selector.length > 4 && (selector[4] === '.' || selector[4] === ':' || selector[4] === '[' || selector[4] === ' ')) {
    // body .child → scope .child (descendant)
    if (selector[4] === ' ') {
      return `${scope} ${selector.slice(5)}`;
    }
    // body.class or body:pseudo → scope.class / scope:pseudo
    return scope + selector.slice(4);
  }

  // Descendant form: matches when some ANCESTOR carries the scope attribute
  // (e.g. a plugin's own view container).
  const descendantForm = `${scope} ${selector}`;

  // Self form: matches when the selector's own leading element carries the
  // scope attribute directly. Needed for plugins that build UI by inserting
  // elements straight into shared workspace DOM (toolbars, popovers) rather
  // than their own view container — there is no wrapping ancestor to match,
  // only the elements themselves, tagged at creation time (see
  // plugin-execution-context.ts + the createEl patches in install-globals.ts).
  const { head, rest } = splitLeadingCompound(selector);
  const selfForm = `${scope}${head}${rest}`;

  return `${selfForm}, ${descendantForm}`;
}

/**
 * Split a selector into its leading compound (up to the first combinator —
 * space, `>`, `+`, `~` — outside of brackets/parens/quotes) and the remainder,
 * so the scope attribute can be attached directly onto that leading compound.
 */
function splitLeadingCompound(selector: string): { head: string; rest: string } {
  let i = 0;
  let depth = 0;

  while (i < selector.length) {
    const ch = selector[i]!;

    if (ch === '"' || ch === "'") {
      i = skipString(selector, i);
      continue;
    }
    if (ch === '(' || ch === '[') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')' || ch === ']') {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      break;
    }
    i++;
  }

  return { head: selector.slice(0, i), rest: selector.slice(i) };
}

/**
 * Split comma-separated selectors, respecting parentheses and brackets.
 */
function splitSelectors(selectorText: string): string[] {
  const selectors: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i]!;
    if (ch === '(' || ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      selectors.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    selectors.push(current);
  }

  return selectors;
}

/**
 * Find the index of a character in css starting from startIndex,
 * respecting quoted strings and comments.
 */
function findUnquotedChar(css: string, char: string, startIndex: number): number {
  let i = startIndex;
  while (i < css.length) {
    const ch = css[i]!;

    // Skip comments
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }

    // Skip quoted strings
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }

    if (ch === char) return i;
    i++;
  }
  return -1;
}

/**
 * Skip past a quoted string starting at index (where css[index] is the quote char).
 */
function skipString(css: string, index: number): number {
  const quote = css[index]!;
  let i = index + 1;
  while (i < css.length) {
    if (css[i] === '\\') {
      i += 2; // Skip escaped character
      continue;
    }
    if (css[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return i;
}

/**
 * Find the matching closing brace for an opening brace at braceIndex.
 */
function findMatchingBrace(css: string, braceIndex: number): number {
  let depth = 1;
  let i = braceIndex + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i]!;

    // Skip comments
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) return css.length;
      i = end + 2;
      continue;
    }

    // Skip strings
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') depth--;

    if (depth > 0) i++;
  }
  return i;
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';
}

/**
 * Validate CSS by attempting to check for obvious issues.
 * Returns true if the CSS appears potentially invalid.
 * Note: We still inject invalid CSS (browser ignores bad rules) but warn.
 */
function hasInvalidCssIndicators(css: string): boolean {
  // Check for mismatched braces
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]!;
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) return true; // Unclosed comment
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(css, i) - 1;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) return true; // Unmatched closing brace
  }
  return depth !== 0; // Unclosed braces
}

/**
 * CssInjector — Manages CSS injection and removal for plugins.
 * Implements scoped styles via [data-plugin-id] attribute selectors.
 */
export class CssInjector implements ICssInjector {
  /**
   * Inject scoped CSS for a plugin into the document head.
   *
   * @param pluginId - Unique plugin identifier
   * @param css - Raw CSS content from styles.css
   */
  inject(pluginId: string, css: string): void {
    // Check size limit (byte length)
    const byteLength = new TextEncoder().encode(css).length;
    if (byteLength > MAX_CSS_SIZE_BYTES) {
      console.error(
        `[plugin:${pluginId}] styles.css exceeds maximum size of 512 KB (${byteLength} bytes). CSS not injected.`
      );
      return;
    }

    // Warn on potentially invalid CSS
    if (hasInvalidCssIndicators(css)) {
      console.warn(
        `[plugin:${pluginId}] styles.css may contain invalid CSS. Injecting anyway (browser will ignore invalid rules).`
      );
    }

    // Remove existing style element if present (re-injection scenario)
    this.remove(pluginId);

    // Scope CSS selectors
    const scopedCss = scopeCss(css, pluginId);

    // Create and inject <style> element
    const style = document.createElement('style');
    style.setAttribute('data-plugin-id', pluginId);
    style.textContent = scopedCss;
    document.head.appendChild(style);
  }

  /**
   * Remove injected CSS for a plugin from the document head.
   *
   * @param pluginId - Unique plugin identifier
   */
  remove(pluginId: string): void {
    const existing = document.querySelector(`style[data-plugin-id="${pluginId}"]`);
    if (existing) {
      existing.remove();
    }
  }
}
