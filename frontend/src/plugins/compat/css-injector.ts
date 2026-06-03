/**
 * CSS Injector — Scoped CSS injection for Obsidian plugin compatibility.
 *
 * Injects plugin CSS into <style> elements with data-plugin-id attributes.
 * All selectors are scoped with [data-plugin-id="<pluginId>"] to prevent
 * style leakage between plugins and the host application.
 */

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
 * Scope a single selector (no commas).
 */
function scopeSingleSelector(selector: string, scope: string): string {
  if (!selector) return scope;

  // :root → replace with scope
  if (selector === ':root') {
    return scope;
  }

  // If selector starts with :root, replace :root portion with scope
  if (selector.startsWith(':root')) {
    return scope + selector.slice(5);
  }

  // Prefix with scope
  return `${scope} ${selector}`;
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
