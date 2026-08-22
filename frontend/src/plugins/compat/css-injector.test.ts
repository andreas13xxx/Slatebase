import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CssInjector, scopeCss } from './css-injector';

describe('CssInjector', () => {
  let injector: CssInjector;

  beforeEach(() => {
    injector = new CssInjector();
  });

  afterEach(() => {
    // Clean up any injected style elements
    document.querySelectorAll('style[data-plugin-id]').forEach(el => el.remove());
  });

  describe('inject()', () => {
    it('injects a <style> element with data-plugin-id attribute', () => {
      injector.inject('my-plugin', '.foo { color: red; }');

      const style = document.querySelector('style[data-plugin-id="my-plugin"]');
      expect(style).not.toBeNull();
      expect(style?.getAttribute('data-plugin-id')).toBe('my-plugin');
    });

    it('injects CSS into the document head', () => {
      injector.inject('test-plugin', '.bar { font-size: 14px; }');

      const style = document.head.querySelector('style[data-plugin-id="test-plugin"]');
      expect(style).not.toBeNull();
    });

    it('scopes CSS selectors with [data-plugin-id] prefix', () => {
      injector.inject('scoped-plugin', '.container { margin: 0; }');

      const style = document.querySelector('style[data-plugin-id="scoped-plugin"]');
      expect(style?.textContent).toContain('[data-plugin-id="scoped-plugin"] .container');
    });

    it('removes existing style element before re-injection', () => {
      injector.inject('dup-plugin', '.first { color: red; }');
      injector.inject('dup-plugin', '.second { color: blue; }');

      const styles = document.querySelectorAll('style[data-plugin-id="dup-plugin"]');
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toContain('.second');
      expect(styles[0]?.textContent).not.toContain('.first');
    });

    it('rejects CSS exceeding 512 KB with error log', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const largeCss = 'a'.repeat(512 * 1024 + 1);

      injector.inject('large-plugin', largeCss);

      const style = document.querySelector('style[data-plugin-id="large-plugin"]');
      expect(style).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum size of 512 KB')
      );
      errorSpy.mockRestore();
    });

    it('warns on invalid CSS but still injects', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const invalidCss = '.broken { color: red; '; // Missing closing brace

      injector.inject('invalid-plugin', invalidCss);

      const style = document.querySelector('style[data-plugin-id="invalid-plugin"]');
      expect(style).not.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('may contain invalid CSS')
      );
      warnSpy.mockRestore();
    });

    it('does not warn on valid CSS', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      injector.inject('valid-plugin', '.ok { color: green; }');

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('handles empty CSS string', () => {
      injector.inject('empty-plugin', '');

      const style = document.querySelector('style[data-plugin-id="empty-plugin"]');
      expect(style).not.toBeNull();
      expect(style?.textContent).toBe('');
    });
  });

  describe('remove()', () => {
    it('removes the <style> element with matching data-plugin-id', () => {
      injector.inject('removable', '.x { color: red; }');
      expect(document.querySelector('style[data-plugin-id="removable"]')).not.toBeNull();

      injector.remove('removable');
      expect(document.querySelector('style[data-plugin-id="removable"]')).toBeNull();
    });

    it('does nothing if no matching style element exists', () => {
      // Should not throw
      injector.remove('nonexistent');
    });

    it('does not remove style elements of other plugins', () => {
      injector.inject('plugin-a', '.a { color: red; }');
      injector.inject('plugin-b', '.b { color: blue; }');

      injector.remove('plugin-a');

      expect(document.querySelector('style[data-plugin-id="plugin-a"]')).toBeNull();
      expect(document.querySelector('style[data-plugin-id="plugin-b"]')).not.toBeNull();
    });
  });
});

describe('scopeCss()', () => {
  const pluginId = 'test-plugin';
  const scope = `[data-plugin-id="${pluginId}"]`;

  describe('regular selectors', () => {
    it('prefixes a simple class selector', () => {
      const result = scopeCss('.container { margin: 0; }', pluginId);
      expect(result).toContain(`${scope} .container {`);
    });

    it('prefixes an element selector', () => {
      const result = scopeCss('div { padding: 10px; }', pluginId);
      expect(result).toContain(`${scope} div {`);
    });

    it('prefixes an ID selector', () => {
      const result = scopeCss('#main { width: 100%; }', pluginId);
      expect(result).toContain(`${scope} #main {`);
    });

    it('prefixes a compound selector', () => {
      const result = scopeCss('div.active > span { color: red; }', pluginId);
      expect(result).toContain(`${scope} div.active > span {`);
    });
  });

  describe('grouped selectors', () => {
    it('prefixes each selector in a group', () => {
      const result = scopeCss('h1, h2, h3 { font-weight: bold; }', pluginId);
      expect(result).toContain(`${scope} h1`);
      expect(result).toContain(`${scope} h2`);
      expect(result).toContain(`${scope} h3`);
    });
  });

  describe('host marker classes', () => {
    // Regression: theme/platform classes live on <body>, never on a plugin's
    // own element. Folding them into the scope produced
    // `[data-plugin-id="x"].theme-dark .panel`, which asks a single element to
    // be both at once — so every plugin's dark-mode block was dead CSS.
    it('keeps a leading .theme-dark in front of the scope', () => {
      const result = scopeCss('.theme-dark .panel { color: red; }', pluginId);
      expect(result).toContain(`body.theme-dark [data-plugin-id="${pluginId}"]`);
      expect(result).not.toContain(`[data-plugin-id="${pluginId}"].theme-dark`);
    });

    it('treats body.theme-dark the same as a bare .theme-dark', () => {
      const bare = scopeCss('.theme-dark .panel { color: red; }', pluginId);
      const explicit = scopeCss('body.theme-dark .panel { color: red; }', pluginId);
      expect(explicit).toBe(bare);
    });

    it('guards every generated alternative, not just the first', () => {
      // Prefixing only the joined string would leave the descendant form
      // unguarded, so a dark-mode rule would also apply in light mode.
      const result = scopeCss('.theme-dark .panel { color: red; }', pluginId);
      for (const form of result.slice(0, result.indexOf('{')).split(',')) {
        expect(form.trim().startsWith('body.theme-dark ')).toBe(true);
      }
    });

    it('handles chained host classes', () => {
      const result = scopeCss('.theme-dark.is-mobile .panel { color: red; }', pluginId);
      expect(result).toContain(`body.theme-dark.is-mobile [data-plugin-id="${pluginId}"]`);
    });

    it('scopes platform classes the same way', () => {
      const result = scopeCss('body.is-mobile .sidebar { display: none; }', pluginId);
      expect(result).toContain(`body.is-mobile [data-plugin-id="${pluginId}"]`);
    });

    it('makes the plugin scope the subject when the host class stands alone', () => {
      // `.theme-dark { --x: red }` defines a variable the plugin's own elements
      // should inherit under the dark theme.
      const result = scopeCss('.theme-dark { --my-var: red; }', pluginId);
      expect(result).toContain(`body.theme-dark [data-plugin-id="${pluginId}"] {`);
    });

    it('applies the prefix per comma-separated selector', () => {
      const result = scopeCss('.theme-dark .a, .theme-light .b { color: red; }', pluginId);
      expect(result).toContain('body.theme-dark');
      expect(result).toContain('body.theme-light');
    });

    it('leaves a plugin class that merely looks host-ish alone', () => {
      const result = scopeCss('.theme-parade { color: red; }', pluginId);
      expect(result).not.toContain('body.');
      expect(result).toContain(`[data-plugin-id="${pluginId}"].theme-parade`);
    });
  });

  describe(':root handling', () => {
    it('replaces :root with scope', () => {
      const result = scopeCss(':root { --color: red; }', pluginId);
      expect(result).toContain(`${scope} {`);
      expect(result).not.toContain(':root');
    });

    it('replaces :root in compound selectors', () => {
      const result = scopeCss(':root .dark { color: white; }', pluginId);
      expect(result).toContain(`${scope} .dark {`);
    });
  });

  describe('body selector', () => {
    it('replaces body selector with scope (like :root)', () => {
      const result = scopeCss('body { margin: 0; }', pluginId);
      expect(result).toContain(`${scope} {`);
    });

    // `is-mobile` used to be the example here, which quietly asserted the
    // host-class bug: it is one of Obsidian's body markers, so folding it into
    // the scope produced a selector that could never match (see the
    // 'host marker classes' block above, which now covers that case). A plugin's
    // own body class is what this path is actually for.
    it('replaces body.class selector with scope.class', () => {
      const result = scopeCss('body.my-plugin-active .sidebar { display: none; }', pluginId);
      expect(result).toContain(`${scope}.my-plugin-active .sidebar`);
    });

    it('replaces body descendant selector', () => {
      const result = scopeCss('body .content { padding: 10px; }', pluginId);
      expect(result).toContain(`${scope} .content`);
    });
  });

  describe('@media rules', () => {
    it('prefixes selectors inside @media blocks', () => {
      const css = '@media (max-width: 768px) { .sidebar { display: none; } }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain('@media (max-width: 768px)');
      expect(result).toContain(`${scope} .sidebar`);
    });

    it('handles nested @media with multiple selectors', () => {
      const css = '@media screen { h1 { color: red; } p { margin: 0; } }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain(`${scope} h1`);
      expect(result).toContain(`${scope} p`);
    });
  });

  describe('@keyframes (not scoped)', () => {
    it('does not scope selectors inside @keyframes', () => {
      const css = '@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain('@keyframes fadeIn');
      expect(result).toContain('from { opacity: 0; }');
      expect(result).not.toContain(`${scope} from`);
    });
  });

  describe('@font-face (not scoped)', () => {
    it('does not scope @font-face contents', () => {
      const css = '@font-face { font-family: "MyFont"; src: url("font.woff2"); }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain('@font-face');
      expect(result).toContain('font-family: "MyFont"');
      expect(result).not.toContain(`${scope}`);
    });
  });

  describe('@supports rules', () => {
    it('prefixes selectors inside @supports blocks', () => {
      const css = '@supports (display: grid) { .grid { display: grid; } }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain('@supports (display: grid)');
      expect(result).toContain(`${scope} .grid`);
    });
  });

  describe('comments', () => {
    it('preserves CSS comments', () => {
      const css = '/* header styles */ .header { color: blue; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain('/* header styles */');
      expect(result).toContain(`${scope} .header`);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = scopeCss('', pluginId);
      expect(result).toBe('');
    });

    it('handles CSS with only comments', () => {
      const result = scopeCss('/* nothing here */', pluginId);
      expect(result).toContain('/* nothing here */');
    });

    it('handles multiple rules', () => {
      const css = '.a { color: red; } .b { color: blue; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain(`${scope} .a`);
      expect(result).toContain(`${scope} .b`);
    });

    it('handles selectors with pseudo-classes', () => {
      const css = '.btn:hover { opacity: 0.8; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain(`${scope} .btn:hover`);
    });

    it('handles selectors with pseudo-elements', () => {
      const css = '.item::before { content: ""; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain(`${scope} .item::before`);
    });

    it('handles attribute selectors', () => {
      const css = '[type="text"] { border: 1px solid; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain(`${scope} [type="text"]`);
    });

    it('handles * (universal) selector', () => {
      const css = '* { box-sizing: border-box; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain(`${scope} *`);
    });

    it('handles @import at-rules (no block)', () => {
      const css = '@import url("reset.css"); .main { color: black; }';
      const result = scopeCss(css, pluginId);
      expect(result).toContain('@import url("reset.css");');
      expect(result).toContain(`${scope} .main`);
    });
  });
});
