/**
 * The alias table maps Obsidian's built-in icon names onto Lucide's, and its
 * targets are only correct against one version of `lucide-react`. Lucide renames
 * and retires icons between releases (`check-circle` → `circle-check`,
 * `trello` removed entirely), and a stale target fails silently: the icon
 * falls back to the generic placeholder glyph, which reads as a styling bug
 * rather than a missing mapping. This test is what turns that into a build
 * failure.
 */
import { describe, it, expect } from 'vitest'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { getBuiltInIconIds, resolveLucideIconNode } from './lucide-icons'

const lucideNames = new Set(Object.keys(dynamicIconImports as Record<string, unknown>))

/** Obsidian built-ins that carry no `-glyph` suffix to strip, so they need an explicit alias. */
const OBSIDIAN_BUILT_INS = [
  'agenda', 'any-key', 'audio-file', 'broken-link', 'bullet-list',
  'calendar-with-checkmark', 'check-in-circle', 'check-small', 'checkmark',
  'create-new', 'cross', 'cross-in-box', 'crossed-out-eye', 'crossed-star',
  'dice', 'document', 'documents', 'dot-network', 'enter', 'exit-fullscreen',
  'expand-vertically', 'filled-pin', 'forward-arrow', 'gear', 'go-to-file',
  'hashtag', 'help', 'horizontal-split', 'image-file', 'install',
  'left-arrow', 'lines-of-text', 'magnifying-glass', 'microphone',
  'minus-with-circle', 'open-vault', 'pane-layout', 'paper-plane', 'paused',
  'pdf-file', 'plus-with-circle', 'popup-open', 'reset', 'right-arrow',
  'right-triangle', 'run-command', 'sheets-in-box', 'stacked-levels',
  'star-list', 'sync', 'three-horizontal-bars', 'two-blank-pages',
  'up-and-down-arrows', 'uppercase-lowercase-a', 'vertical-split',
  'vertical-three-dots',
]

describe('lucide-icons', () => {
  it('resolves every Obsidian built-in that needs an explicit alias', async () => {
    const unresolved: string[] = []
    for (const id of OBSIDIAN_BUILT_INS) {
      if (!(await resolveLucideIconNode(id))) unresolved.push(id)
    }
    expect(unresolved).toEqual([])
  })

  it('offers the whole Lucide set to icon pickers, not just registered icons', () => {
    const ids = getBuiltInIconIds()
    // getIconIds() feeds plugin icon pickers; a short list makes them look empty.
    expect(ids.length).toBeGreaterThan(lucideNames.size)
    expect(ids).toContain('file-text')
  })

  it('renders an svg carrying the classes Obsidian tags icons with', async () => {
    const icon = await resolveLucideIconNode('gear')
    expect(icon).not.toBeNull()
    // Obsidian resolves `gear` to Lucide's `settings`, and plugin/theme CSS
    // targets the resolved name rather than the Obsidian alias.
    expect(icon?.lucideName).toBe('settings')
  })

  it('falls back to the placeholder glyph for a name that is not an icon at all', async () => {
    const icon = await resolveLucideIconNode('definitely-not-an-icon')
    expect(icon?.lucideName).toBe('circle-help')
  })
})
