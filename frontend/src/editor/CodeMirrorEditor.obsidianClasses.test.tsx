import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CodeMirrorEditor } from './CodeMirrorEditor'

/**
 * Obsidian marker classes the editor puts on its area (`mod-cm6`, `is-live-preview`,
 * `is-readable-line-width`) and on `.cm-editor` (`cm-s-obsidian`). Themes key rules on them
 * (Minimal's table and editor-width rules hang on `.markdown-source-view.mod-cm6`); Slatebase's
 * own CSS must not, or the look without a theme would change.
 */

function renderEditor(props: { livePreview?: boolean; readableLineLength?: boolean; tabId?: string } = {}) {
  const make = (p: typeof props) => (
    <div data-testid="area">
      <CodeMirrorEditor
        content="# Title"
        onContentChange={() => undefined}
        tabId={p.tabId ?? 'tab-1'}
        livePreview={p.livePreview ?? false}
        readableLineLength={p.readableLineLength ?? true}
      />
    </div>
  )
  const utils = render(make(props))
  return {
    ...utils,
    area: () => utils.getByTestId('area'),
    update: (next: typeof props) => utils.rerender(make(next)),
  }
}

describe('CodeMirrorEditor Obsidian marker classes', () => {
  it('marks the editor area with mod-cm6 next to markdown-source-view', () => {
    const { area } = renderEditor()
    expect(area().classList.contains('mod-cm6')).toBe(true)
    expect(area().classList.contains('markdown-source-view')).toBe(true)
  })

  it('puts cm-s-obsidian on the .cm-editor root', () => {
    const { container } = renderEditor()
    expect(container.querySelector('.cm-editor')?.classList.contains('cm-s-obsidian')).toBe(true)
  })

  it('is-live-preview follows the mode, including a switch while mounted', () => {
    const { area, update } = renderEditor({ livePreview: false })
    expect(area().classList.contains('is-live-preview')).toBe(false)

    update({ livePreview: true })
    expect(area().classList.contains('is-live-preview')).toBe(true)

    update({ livePreview: false })
    expect(area().classList.contains('is-live-preview')).toBe(false)
  })

  it('is-readable-line-width follows the setting and mirrors cm-full-width', () => {
    const { area, container, update } = renderEditor({ readableLineLength: true })
    expect(area().classList.contains('is-readable-line-width')).toBe(true)
    expect(container.querySelector('.cm-editor-wrapper')?.classList.contains('cm-full-width')).toBe(false)

    update({ readableLineLength: false })
    expect(area().classList.contains('is-readable-line-width')).toBe(false)
    expect(container.querySelector('.cm-editor-wrapper')?.classList.contains('cm-full-width')).toBe(true)
  })

  it('keeps the classes when only the mode changes (no flicker of mod-cm6)', () => {
    const { area, update } = renderEditor({ livePreview: false })
    update({ livePreview: true })
    expect(area().classList.contains('mod-cm6')).toBe(true)
    expect(area().classList.contains('markdown-source-view')).toBe(true)
  })

  it('removes the classes when the editor unmounts', () => {
    const { area, unmount } = renderEditor({ livePreview: true })
    const node = area()
    expect(node.classList.contains('mod-cm6')).toBe(true)

    unmount()

    for (const cls of ['mod-cm6', 'is-live-preview', 'is-readable-line-width', 'markdown-source-view']) {
      expect(node.classList.contains(cls), cls).toBe(false)
    }
  })
})

describe('Slatebase CSS does not target the Obsidian marker classes', () => {
  const TARGET_CLASSES = ['mod-cm6', 'is-live-preview', 'is-readable-line-width', 'cm-s-obsidian']

  /** Lists app CSS files; `plugins/compat/` is Obsidian compat CSS for plugin DOM and is checked separately. */
  function cssFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        if (name !== 'node_modules') cssFiles(path, out)
      } else if (name.endsWith('.css')) {
        out.push(path)
      }
    }
    return out
  }

  const srcDir = join(process.cwd(), 'src')

  it.each(TARGET_CLASSES)('no CSS rule selects .%s', (cls) => {
    const pattern = new RegExp(`\\.${cls}(?![\\w-])`)
    const offenders = cssFiles(srcDir)
      .filter((file) => pattern.test(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
      .map((file) => relative(srcDir, file))
    expect(offenders).toEqual([])
  })
})
