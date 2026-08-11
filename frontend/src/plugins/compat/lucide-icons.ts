/**
 * Resolves Obsidian's built-in icon names (which are just Lucide icon IDs,
 * e.g. "chevron-down", "file-text") to renderable SVG data.
 *
 * Real Obsidian ships the entire Lucide set in its app bundle, so plugin
 * calls to setIcon(el, 'lucide-name') work for any icon, not just ones the
 * plugin registered itself via addIcon(). Our compat layer only had the
 * addIcon() registry, so any plugin button using a built-in icon name (the
 * common case — e.g. Editing Toolbar's command buttons) rendered as an empty
 * pill. lucide-react is already a dependency (used by Slatebase's own UI),
 * and ships a per-icon dynamic-import map — we reuse that instead of adding
 * a new dependency or bundling all ~1500 icons up front.
 */

import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { warnOnce } from './log'

type IconNode = readonly (readonly [string, Record<string, string>])[]

/** Resolved icon data plus the Lucide name it resolved through. */
interface ResolvedIcon {
  node: IconNode
  /** The Lucide package name that matched — becomes the `lucide-*` CSS class. */
  lucideName: string
}

const iconImports = dynamicIconImports as Record<string, (() => Promise<{ __iconNode: IconNode }>) | undefined>

// undefined = never attempted, null = attempted and no such icon
const nodeCache = new Map<string, ResolvedIcon | null>()

/** Last-resort node used only if the 'circle-help' dynamic import itself fails to load. */
const FALLBACK_ICON_NODE: IconNode = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }],
  ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }],
]

// Obsidian's built-in icon names don't always match Lucide's package names:
// most "-glyph" names are Obsidian-specific variants of a standard icon whose
// bare name (glyph suffix stripped) already matches Lucide directly — that
// case needs no entry here, see candidateNames() below. This table is only
// for names where the bare/stripped form ISN'T a real Lucide name, so an
// explicit target is required. Every target here is verified to exist in the
// installed lucide-react package's icon list (checked programmatically), but
// the semantic match is still best-effort, not a pixel-perfect copy of
// Obsidian's (slightly different, hand-drawn) originals.
//
// Sources for the icon-id side of this table:
// - Every setIcon()/icon: string found in the plugin bundles actually
//   installed in this vault (Dataview, Excalidraw, Editing Toolbar).
// - Obsidian's full internal icon set, as reconstructed from a community
//   theme (obsidian-california-coast-theme's icons.json) that has to
//   restyle every icon the app uses to be complete — the closest thing to
//   an authoritative list short of Obsidian's own (unpublished) source.
//
// Two names from that theme's list are deliberately NOT mapped here:
// 'logo-crystal' (Obsidian's own brand mark — no Lucide icon is a faithful
// substitute) and 'switch' (too ambiguous — no single Lucide icon reads as
// "switch vault" without more context). Both fall through to a blank icon,
// same as before this table existed, rather than risk a misleading shape.
const EXPLICIT_ALIASES: Record<string, readonly string[]> = {
  'undo-glyph': ['undo', 'undo-2'],
  'redo-glyph': ['redo', 'redo-2'],
  'highlight-glyph': ['highlighter'],
  'header-n': ['heading'],
  'heading-glyph': ['heading'],
  'missing-glyph': ['circle-help'],
  'question-mark-glyph': ['circle-help'],
  'help': ['circle-help'],
  'add-note-glyph': ['file-plus'],
  'note-glyph': ['file-text'],
  'document': ['file-text'],
  'documents': ['files'],
  'pdf-file': ['file-text'],
  'audio-file': ['file-audio'],
  'image-file': ['file-image'],
  'restore-file-glyph': ['history'],
  'file-explorer-glyph': ['folder-tree'],
  'open-elsewhere-glyph': ['external-link'],
  'popup-open': ['external-link'],
  'go-to-file': ['file-search'],
  'merge-files-glyph': ['merge'],
  'duplicate-glyph': ['copy-plus'],
  'create-new': ['file-plus'],
  'bracket-glyph': ['brackets'],
  'bullet-list-glyph': ['list'],
  'bullet-list': ['list'],
  'number-list-glyph': ['list-ordered'],
  'checkbox-glyph': ['square-check'],
  'check-in-circle': ['check-circle', 'circle-check'],
  'check-small': ['check'],
  'checkmark': ['check'],
  'cross': ['x'],
  'cross-in-box': ['square-x'],
  'crossed-star': ['star-off'],
  'codeblock-glyph': ['square-code'],
  'unindent-glyph': ['outdent'],
  'indent-glyph': ['indent'],
  'left-chevron-glyph': ['chevron-left'],
  'right-chevron-glyph': ['chevron-right'],
  'up-chevron-glyph': ['chevron-up'],
  'down-chevron-glyph': ['chevron-down'],
  'double-up-arrow-glyph': ['chevrons-up'],
  'double-down-arrow-glyph': ['chevrons-down'],
  'up-curly-arrow-glyph': ['corner-up-right'],
  'down-curly-arrow-glyph': ['corner-down-right'],
  'left-arrow': ['arrow-left'],
  'left-arrow-with-tail': ['arrow-left'],
  'right-arrow': ['arrow-right'],
  'right-arrow-with-tail': ['arrow-right'],
  'forward-arrow': ['arrow-right'],
  'up-arrow-with-tail': ['arrow-up'],
  'down-arrow-with-tail': ['arrow-down'],
  'up-and-down-arrows': ['arrow-up-down'],
  'right-triangle': ['chevron-right'],
  'enlarge-glyph': ['maximize-2'],
  'compress-glyph': ['minimize-2'],
  'expand-vertically': ['unfold-vertical'],
  'exit-fullscreen': ['minimize'],
  'gear': ['settings'],
  'vertical-split': ['columns-2'],
  'horizontal-split': ['rows-2'],
  'graph-glyph': ['waypoints'],
  'dot-network': ['network', 'share-2'],
  'workspace-glyph': ['layout-grid'],
  'pane-layout': ['layout-panel-left'],
  'editingToolbar': ['panel-top'],
  'navigate-glyph': ['navigation'],
  'dice-glyph': ['dices'],
  'dice': ['dices'],
  'wrench-screwdriver-glyph': ['wrench'],
  'paper-plane-glyph': ['send'],
  'paper-plane': ['send'],
  'percent-sign-glyph': ['percent'],
  'price-tag-glyph': ['tag'],
  'play-audio-glyph': ['play'],
  'paused': ['pause'],
  'stop-audio-glyph': ['circle-stop'],
  'tomorrow-glyph': ['calendar-plus'],
  'yesterday-glyph': ['calendar-minus'],
  'calendar-with-checkmark': ['calendar-check', 'calendar-check-2'],
  'any-key': ['keyboard'],
  'broken-link': ['unlink', 'link-2-off'],
  'filled-pin': ['map-pin'],
  'hashtag': ['hash'],
  'install': ['download'],
  'lines-of-text': ['align-left'],
  'magnifying-glass': ['search'],
  'microphone': ['mic'],
  'microphone-filled': ['mic'],
  'minus-with-circle': ['circle-minus'],
  'plus-with-circle': ['circle-plus'],
  'open-vault': ['folder-open'],
  'reset': ['rotate-ccw'],
  'run-command': ['terminal'],
  'sheets-in-box': ['copy'],
  'stacked-levels': ['list-tree'],
  'star-list': ['star'],
  'sync-small': ['refresh-cw'],
  'sync': ['refresh-cw'],
  'three-horizontal-bars': ['menu'],
  'uppercase-lowercase-a': ['case-sensitive'],
  'vertical-three-dots': ['ellipsis-vertical'],
  'lucide-trello': ['kanban'],
  'trello': ['kanban'],
  'agenda': ['list-todo'],
  'crossed-out-eye': ['eye-off'],
  'enter': ['corner-down-left'],
  'two-blank-pages': ['files'],
  // obsidian-excalidraw-plugin's own icon ids (ribbon icon, script-engine
  // command, "export as image" action) — not Obsidian built-ins, but the
  // same "verified to exist in the installed lucide-react package" rule
  // applies.
  'excalidraw-icon': ['shapes'],
  'ScriptEngine': ['square-code'],
  'export-img': ['image-down'],
}

// Obsidian's built-in set also includes third-party brand marks (GitHub,
// Twitter, YouTube, ...) that plugins reference for "support the author"
// links, embed previews, and the like. Lucide dropped brand logos from its
// scope entirely (github.com/lucide-icons/lucide/issues/94), so unlike the
// EXPLICIT_ALIASES table above, no Lucide icon can stand in for these — there
// is no generic shape that reads as "this is the GitHub logo" the way
// 'circle-help' reads for 'missing-glyph'. These are the real marks instead:
// exact path data from Simple Icons (simpleicons.org, CC0-licensed), solid
// fills rather than Lucide's stroked-outline style, added on request as
// plugins are found to need them.
const BRAND_ICON_PATHS: Record<string, string> = {
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  twitter:
    'M21.543 7.104c.015.211.015.423.015.636 0 6.507-4.954 14.01-14.01 14.01v-.003A13.94 13.94 0 0 1 0 19.539a9.88 9.88 0 0 0 7.287-2.041 4.93 4.93 0 0 1-4.6-3.42 4.916 4.916 0 0 0 2.223-.084A4.926 4.926 0 0 1 .96 9.167v-.062a4.887 4.887 0 0 0 2.235.616A4.928 4.928 0 0 1 1.67 3.148 13.98 13.98 0 0 0 11.82 8.292a4.929 4.929 0 0 1 8.39-4.49 9.868 9.868 0 0 0 3.128-1.196 4.941 4.941 0 0 1-2.165 2.724A9.828 9.828 0 0 0 24 4.555a10.019 10.019 0 0 1-2.457 2.549z',
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
}

/**
 * Look up a hand-authored brand mark. `fill`/`stroke` are set directly on the
 * path (rather than relying on the shell's stroked-outline defaults from
 * {@link createIconShell}) since explicit attributes on the element win over
 * values inherited from its parent `<svg>`.
 */
function resolveBrandIcon(iconId: string): ResolvedIcon | null {
  const d = BRAND_ICON_PATHS[iconId]
  if (!d) return null
  return { node: [['path', { d, fill: 'currentColor', stroke: 'none' }]], lucideName: iconId }
}

/**
 * Every icon id `setIcon()`/`getIcon()` can resolve: the full Lucide set plus
 * the Obsidian-specific aliases and brand marks above.
 *
 * Obsidian's `getIconIds()` returns its built-ins, and plugins call it to build
 * icon pickers — returning only the handful a plugin registered itself made
 * those pickers look empty.
 */
export function getBuiltInIconIds(): string[] {
  return [...Object.keys(iconImports), ...Object.keys(EXPLICIT_ALIASES), ...Object.keys(BRAND_ICON_PATHS)]
}

function candidateNames(iconId: string): string[] {
  const names = [iconId]
  const aliases = EXPLICIT_ALIASES[iconId]
  if (aliases) names.push(...aliases)
  if (iconId.startsWith('lucide-')) names.push(iconId.slice('lucide-'.length))
  if (iconId.endsWith('-glyph')) names.push(iconId.slice(0, -'-glyph'.length))
  const headerMatch = /^header-(\d)$/.exec(iconId)
  if (headerMatch) names.push(`heading-${headerMatch[1]}`)
  return names
}

/** Synchronous lookup of a previously-resolved icon. Use before falling back to the async path. */
export function getCachedLucideIconNode(iconId: string): ResolvedIcon | null | undefined {
  return nodeCache.get(iconId)
}

let builtInIconIdSet: Set<string> | null = null
function getBuiltInIconIdSet(): Set<string> {
  builtInIconIdSet ??= new Set(getBuiltInIconIds())
  return builtInIconIdSet
}

// Matches bare kebab-case tokens the way Lucide/Obsidian icon ids are shaped
// ("image-down", "chevron-right"). Capped at 5 hyphenated segments — no real
// icon id is longer — so it doesn't run away across unrelated minified code.
const ICON_LITERAL_RE = /["']([a-z][a-z0-9]*(?:-[a-z0-9]+){0,4})["']/g

/**
 * Warm the icon cache for every valid icon id that appears as a string
 * literal anywhere in a plugin bundle's source, before the bundle evaluates.
 *
 * Real Obsidian's getIcon() is synchronous because the whole Lucide set ships
 * in its app bundle. Ours resolves per-icon on demand (see file header) —
 * fine for icons appended straight into a live DOM element, since the async
 * fill-in shows up whenever it lands. It breaks for a pattern several plugins
 * use: resolving every icon once into a frozen React/vDOM tree at module load,
 * e.g. Excalidraw's `ICONS = { Foo: getIconAsJSX('image-down'), ... }` at its
 * top level. getIcon() hands back an empty shell there, the plugin snapshots
 * it into React elements before the dynamic import resolves, and the later
 * DOM mutation lands on a node nothing still points to — that icon stays
 * blank for the rest of the session, no matter how long it runs.
 *
 * Scanning the bundle text for tokens shaped like — and matching — a known
 * icon id, and resolving those first, gets them into the cache synchronously
 * before any of the plugin's own top-level code runs. It only costs as many
 * dynamic imports as the plugin actually references (typically a few dozen),
 * not the full ~1500-icon set.
 */
export async function preloadIconsReferencedIn(bundleSource: string): Promise<void> {
  const validIds = getBuiltInIconIdSet()
  const found = new Set<string>()
  for (const match of bundleSource.matchAll(ICON_LITERAL_RE)) {
    const token = match[1]
    if (token && validIds.has(token)) found.add(token)
  }
  if (found.size === 0) return
  await Promise.all([...found].map((id) => resolveLucideIconNode(id)))
}

/** Load a single Lucide package icon by its exact name, or null if it doesn't exist. */
async function loadLucideIcon(name: string): Promise<IconNode | null> {
  const loader = iconImports[name]
  if (!loader) return null
  try {
    const mod = await loader()
    return mod.__iconNode
  } catch {
    return null
  }
}

/** Resolve and cache a Lucide icon by name. Returns null if there's no such icon. */
export async function resolveLucideIconNode(iconId: string): Promise<ResolvedIcon | null> {
  const cached = nodeCache.get(iconId)
  if (cached !== undefined) return cached
  for (const name of candidateNames(iconId)) {
    const node = await loadLucideIcon(name)
    if (node) {
      const resolved: ResolvedIcon = { node, lucideName: name }
      nodeCache.set(iconId, resolved)
      return resolved
    }
  }
  const brand = resolveBrandIcon(iconId)
  if (brand) {
    nodeCache.set(iconId, brand)
    return brand
  }
  // An unresolved icon rendering as blank space looks like a styling bug
  // rather than a missing mapping, so it falls back to a visible placeholder
  // instead. Candidates are included because the fix is usually a new
  // EXPLICIT_ALIASES entry, and this shows what was already tried.
  warnOnce(
    `lucide-miss::${iconId}`,
    `[PluginCompat] No icon found for "${iconId}" — falling back to a placeholder glyph. ` +
      `Tried Lucide names: ${candidateNames(iconId).join(', ')}. ` +
      `Add a mapping to EXPLICIT_ALIASES in lucide-icons.ts if this is an Obsidian built-in.`,
  )
  const placeholderNode = await loadLucideIcon('circle-help')
  // Obsidian's getIcon() never returns null for an id getIconIds() listed —
  // plugins (e.g. Iconize's icon-pack scan) rely on that guarantee and crash
  // dereferencing a null element otherwise. loadLucideIcon('circle-help')
  // should always succeed, but if the dynamic import itself ever fails, fall
  // back to a hand-drawn node rather than caching null and breaking that
  // contract for every caller of this iconId from then on.
  const placeholder: ResolvedIcon = placeholderNode
    ? { node: placeholderNode, lucideName: 'circle-help' }
    : { node: FALLBACK_ICON_NODE, lucideName: 'circle-help' }
  nodeCache.set(iconId, placeholder)
  return placeholder
}

/**
 * Build an `<svg>` shell carrying the attributes and classes Obsidian's icons
 * have, but no paths yet.
 *
 * Split out from {@link renderLucideIconNode} so the async path can hand back a
 * real element immediately and fill it in later — see {@link getLucideIconElement}.
 */
function createIconShell(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.classList.add('svg-icon')
  return svg
}

/** Draw an icon's paths into an existing shell, and tag it with its `lucide-*` class. */
function fillIconShell(svg: SVGSVGElement, icon: ResolvedIcon): void {
  // Obsidian tags every icon with `lucide-<name>` alongside `svg-icon`, and
  // plugin/theme CSS targets individual icons through it.
  svg.classList.add(`lucide-${icon.lucideName}`)
  for (const [tag, attrs] of icon.node) {
    const child = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value)
    svg.appendChild(child)
  }
}

/** Build a standalone <svg> element from resolved icon data, matching Lucide's standard markup. */
export function renderLucideIconNode(icon: ResolvedIcon): SVGSVGElement {
  const svg = createIconShell()
  fillIconShell(svg, icon)
  return svg
}

/**
 * Return an `<svg>` for `iconId` synchronously, populating it once the icon's
 * dynamic import resolves.
 *
 * Obsidian's `getIcon()` is synchronous and always succeeds for a built-in name,
 * because the whole icon set is in its bundle. Ours loads per icon on demand, so
 * a strictly synchronous implementation returns null for every icon nobody has
 * asked for yet — the caller then draws nothing and never retries. Handing back
 * an empty shell that fills itself in keeps the signature and gets the icon on
 * screen; the element the caller inserted is the one that gets the paths.
 *
 * Returns null only when the icon genuinely does not exist *and* that is already
 * known, since answering that question is what needs the await.
 */
export function getLucideIconElement(iconId: string): SVGSVGElement | null {
  const cached = getCachedLucideIconNode(iconId)
  if (cached === null) return null
  if (cached) return renderLucideIconNode(cached)

  const svg = createIconShell()
  resolveLucideIconNode(iconId).then((icon) => {
    if (icon) fillIconShell(svg, icon)
  })
  return svg
}

/**
 * Populate `parent` with the icon for `iconId`, synchronously if already
 * cached, otherwise as soon as the dynamic import resolves. Does not clear
 * `parent` first — callers that need a clean slate (e.g. re-rendering an
 * existing element) should do that themselves before calling this.
 */
export function renderLucideIconInto(parent: HTMLElement, iconId: string): void {
  const cached = getCachedLucideIconNode(iconId)
  if (cached) {
    parent.appendChild(renderLucideIconNode(cached))
    return
  }
  if (cached === undefined) {
    resolveLucideIconNode(iconId).then(icon => {
      if (icon) parent.appendChild(renderLucideIconNode(icon))
    })
  }
}
