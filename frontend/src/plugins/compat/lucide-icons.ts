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

type IconNode = readonly (readonly [string, Record<string, string>])[]

const iconImports = dynamicIconImports as Record<string, (() => Promise<{ __iconNode: IconNode }>) | undefined>

// undefined = never attempted, null = attempted and no such icon
const nodeCache = new Map<string, IconNode | null>()

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
export function getCachedLucideIconNode(iconId: string): IconNode | null | undefined {
  return nodeCache.get(iconId)
}

/** Resolve and cache a Lucide icon's node data by name. Returns null if there's no such icon. */
export async function resolveLucideIconNode(iconId: string): Promise<IconNode | null> {
  if (nodeCache.has(iconId)) return nodeCache.get(iconId) ?? null
  for (const name of candidateNames(iconId)) {
    const loader = iconImports[name]
    if (!loader) continue
    try {
      const mod = await loader()
      nodeCache.set(iconId, mod.__iconNode)
      return mod.__iconNode
    } catch {
      // try the next candidate name
    }
  }
  nodeCache.set(iconId, null)
  return null
}

/** Build a standalone <svg> element from resolved icon node data, matching Lucide's standard markup. */
export function renderLucideIconNode(node: IconNode): SVGSVGElement {
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
  for (const [tag, attrs] of node) {
    const child = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value)
    svg.appendChild(child)
  }
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
    resolveLucideIconNode(iconId).then(node => {
      if (node) parent.appendChild(renderLucideIconNode(node))
    })
  }
}
