/**
 * Neutralizes `file:` URLs in injected CSS (plugins, themes, snippets).
 *
 * A page served over https must not load or link `file:///` — browsers log a
 * security error and block it. Obsidian-made CSS sometimes carries such URLs,
 * so each `url(file:...)` becomes `url("about:blank")` and each `@import` of a
 * `file:` URL is dropped.
 */
const FILE_URL_FUNCTION = /url\(\s*(['"]?)\s*file:[^)]*\)/gi
const FILE_IMPORT = /@import\s+(?:url\(\s*)?['"]?\s*file:[^;]*;?/gi

export function stripLocalFileUrls(css: string): string {
  if (!/file:/i.test(css)) return css
  return css
    .replace(FILE_IMPORT, '')
    .replace(FILE_URL_FUNCTION, 'url("about:blank")')
}
