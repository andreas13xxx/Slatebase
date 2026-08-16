/**
 * SnippetInjector — Global (unscoped) CSS injection for user CSS snippets.
 *
 * Unlike `plugins/compat/css-injector.ts` (which scopes every plugin's CSS
 * under `[data-plugin-id]` so it cannot leak outside the plugin's own UI),
 * user snippets are meant to affect the whole application (e.g. `body { }`
 * overrides, `:root` variable tweaks) — so this injects raw, unscoped CSS.
 * Deliberately independent of css-injector.ts: different size constant, no
 * shared imports, so the two modules can evolve without coupling.
 */

/** Maximum allowed CSS size in bytes (512 KB) — mirrors the backend limit. */
const MAX_CSS_SIZE_BYTES = 512 * 1024;

export interface ISnippetInjector {
  /** Injects raw (unscoped) CSS content under a snippet-specific style tag. */
  apply(snippetId: string, css: string): void;
  /** Removes the injected style tag for a snippet. */
  remove(snippetId: string): void;
  /** Removes all currently-applied snippet style tags (used on vault switch). */
  removeAll(): void;
}

/**
 * Detects obviously invalid CSS (unmatched braces) so callers can warn
 * without blocking injection — the browser ignores invalid rules on its own.
 */
function hasInvalidCssIndicators(css: string): boolean {
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

/** Tracks currently-applied snippet ids for removeAll(). */
const appliedIds = new Set<string>();

/**
 * SnippetInjector — Manages unscoped CSS injection/removal for user snippets.
 */
export class SnippetInjector implements ISnippetInjector {
  apply(snippetId: string, css: string): void {
    const byteLength = new TextEncoder().encode(css).length;
    if (byteLength > MAX_CSS_SIZE_BYTES) {
      console.error(
        `[snippet:${snippetId}] exceeds maximum size of 512 KB (${byteLength} bytes). Not injected.`
      );
      return;
    }

    if (hasInvalidCssIndicators(css)) {
      console.warn(
        `[snippet:${snippetId}] may contain invalid CSS. Injecting anyway (browser will ignore invalid rules).`
      );
    }

    // Re-injection scenario (e.g. edited content) — remove any existing tag first.
    this.remove(snippetId);

    const style = document.createElement('style');
    style.setAttribute('data-snippet-id', snippetId);
    style.textContent = css;
    document.head.appendChild(style);
    appliedIds.add(snippetId);
  }

  remove(snippetId: string): void {
    const existing = document.querySelector(`style[data-snippet-id="${snippetId}"]`);
    if (existing) {
      existing.remove();
    }
    appliedIds.delete(snippetId);
  }

  removeAll(): void {
    for (const id of [...appliedIds]) {
      this.remove(id);
    }
  }
}

/** Shared singleton instance — snippet application is a single, app-wide concern. */
export const snippetInjector: ISnippetInjector = new SnippetInjector();
