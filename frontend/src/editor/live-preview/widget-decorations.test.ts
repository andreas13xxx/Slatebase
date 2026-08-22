import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { parseTableRow, parseTableRowWithPositions, renderCellInline, buildWidgetDecorations } from './widget-decorations'
import type { DirectoryTree } from '../../types'
import { registerExtension, resetEmbedRegistry } from '../../plugins/compat/embed-registry'

/** Builds an EditorState with the same markdown/GFM setup used by CodeMirrorEditor.tsx. */
function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
}

describe('parseTableRow', () => {
  it('splits a simple row on unescaped pipes', () => {
    expect(parseTableRow('| Guide | Beschreibung |')).toEqual([' Guide ', ' Beschreibung '])
  })

  it('does not split on a backslash-escaped pipe', () => {
    const cells = parseTableRow('| [[Features/Wikilinks\\|Wikilinks]] | Notizen miteinander verlinken |')
    expect(cells).toHaveLength(2)
    expect(cells[0]).toBe(' [[Features/Wikilinks\\|Wikilinks]] ')
    expect(cells[1]).toBe(' Notizen miteinander verlinken ')
  })

  it('handles multiple escaped pipes across cells', () => {
    const cells = parseTableRow('| [[A\\|B]] | [[C\\|D]] |')
    expect(cells).toEqual([' [[A\\|B]] ', ' [[C\\|D]] '])
  })

  it('does not produce an empty column from the optional outer pipes', () => {
    expect(parseTableRow('a | b')).toEqual(['a ', ' b'])
  })
})

describe('parseTableRowWithPositions', () => {
  it('resolves trimmed cell text to correct absolute offsets', () => {
    const line = '| Guide | Beschreibung |'
    const lineFrom = 100
    const cells = parseTableRowWithPositions(line, lineFrom)
    expect(cells.map(c => c.text)).toEqual(['Guide', 'Beschreibung'])
    for (const cell of cells) {
      expect(line.slice(cell.from - lineFrom, cell.to - lineFrom)).toBe(cell.text)
    }
  })

  it('keeps a backslash-escaped pipe inside one cell and resolves correct offsets', () => {
    const line = '| [[A\\|B]] | [[C\\|D]] |'
    const cells = parseTableRowWithPositions(line, 0)
    expect(cells.map(c => c.text)).toEqual(['[[A\\|B]]', '[[C\\|D]]'])
    for (const cell of cells) {
      expect(line.slice(cell.from, cell.to)).toBe(cell.text)
    }
  })

  it('trims surrounding whitespace out of the reported range', () => {
    const line = 'a | b'
    const cells = parseTableRowWithPositions(line, 0)
    expect(cells.map(c => c.text)).toEqual(['a', 'b'])
    for (const cell of cells) {
      expect(line.slice(cell.from, cell.to)).toBe(cell.text)
    }
  })
})

describe('renderCellInline', () => {
  it('renders plain text as-is', () => {
    const el = document.createElement('td')
    renderCellInline(el, 'Notizen miteinander verlinken')
    expect(el.textContent).toBe('Notizen miteinander verlinken')
    expect(el.querySelector('.cm-lp-wikilink')).toBeNull()
  })

  it('renders an escaped-pipe wikilink as a clickable span with the correct target', () => {
    const el = document.createElement('td')
    renderCellInline(el, '[[Features/Wikilinks\\|Wikilinks]]')

    const link = el.querySelector('.cm-lp-wikilink')
    expect(link).not.toBeNull()
    expect(link!.textContent).toBe('Wikilinks')
    expect(link!.getAttribute('data-target')).toBe('Features/Wikilinks')
  })

  it('renders surrounding text alongside the wikilink span', () => {
    const el = document.createElement('td')
    renderCellInline(el, 'See [[Page]] for details')

    expect(el.childNodes).toHaveLength(3)
    expect(el.childNodes[0]!.textContent).toBe('See ')
    expect((el.childNodes[1] as HTMLElement).className).toBe('cm-lp-wikilink')
    expect(el.childNodes[2]!.textContent).toBe(' for details')
  })

  it('renders a plain (non-aliased) wikilink target as the visible text', () => {
    const el = document.createElement('td')
    renderCellInline(el, '[[Features/Wikilinks]]')

    const link = el.querySelector('.cm-lp-wikilink')
    expect(link!.textContent).toBe('Features/Wikilinks')
    expect(link!.getAttribute('data-target')).toBe('Features/Wikilinks')
  })

  it('renders an inline code span literally, not as a wikilink', () => {
    const el = document.createElement('td')
    renderCellInline(el, '`[[Start hier\\|Startseite]]`')

    expect(el.querySelector('.cm-lp-wikilink')).toBeNull()
    const code = el.querySelector('code.cm-lp-inline-code')
    expect(code).not.toBeNull()
    expect(code!.textContent).toBe('[[Start hier\\|Startseite]]')
  })

  it('renders text and code spans around each other correctly', () => {
    const el = document.createElement('td')
    renderCellInline(el, 'See `[[Raw]]` or [[Real]] instead')

    const code = el.querySelector('code.cm-lp-inline-code')
    expect(code!.textContent).toBe('[[Raw]]')

    const link = el.querySelector('.cm-lp-wikilink')
    expect(link!.textContent).toBe('Real')
    expect(link!.getAttribute('data-target')).toBe('Real')
  })
})

describe('buildWidgetDecorations — <center> HTML block', () => {
  it('applies a centering line class to a <center>...</center> block', () => {
    const state = makeState('<center>Starte hier, um die Basics zu lernen: Testtest</center>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const lineDeco = result.decorations.find((r) => {
      const spec = r.value.spec as { attributes?: { class?: string } }
      return spec.attributes?.class === 'cm-lp-html-center'
    })
    expect(lineDeco).toBeDefined()
  })

  it('hides the opening and closing tags as replace decorations', () => {
    const state = makeState('<center>Testtest</center>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const replaceRanges = result.decorations.filter((r) => {
      const spec = r.value.spec as { attributes?: unknown; class?: unknown; widget?: unknown }
      return spec.attributes === undefined && spec.class === undefined && spec.widget === undefined
    })
    const openTag = replaceRanges.find((r) => state.doc.sliceString(r.from, r.to) === '<center>')
    const closeTag = replaceRanges.find((r) => state.doc.sliceString(r.from, r.to) === '</center>')
    expect(openTag).toBeDefined()
    expect(closeTag).toBeDefined()
  })

  it('reveals both tags together as one hideable group', () => {
    const state = makeState('<center>Testtest</center>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    expect(result.hideableRanges).toHaveLength(2)
    const [open, close] = result.hideableRanges
    expect(open!.groupFrom).toBe(close!.groupFrom)
    expect(open!.groupTo).toBe(close!.groupTo)
  })

  it('does not decorate unrelated HTML blocks', () => {
    const state = makeState('<div>Testtest</div>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const centerLine = result.decorations.find((r) => {
      const spec = r.value.spec as { attributes?: { class?: string } }
      return spec.attributes?.class === 'cm-lp-html-center'
    })
    expect(centerLine).toBeUndefined()
  })
})

describe('buildWidgetDecorations — embed kind classification', () => {
  it('renders a non-image/pdf, non-.md extension (e.g. .excalidraw) as a note embed, not a bare file placeholder', () => {
    // Regression test: plugins like Excalidraw rely on their note embed being
    // rendered via a nested ViewMode, so registerMarkdownPostProcessor gets a
    // chance to replace the raw content with the actual drawing — matching
    // Reading mode's detectEmbedType(), which treats any unrecognized
    // extension as a note. A generic file-icon placeholder never reaches
    // ViewMode, so no plugin ever gets a chance to render it.
    const state = makeState('![[Architecture-Diagram.excalidraw]]')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const embedDeco = result.decorations.find((r) => {
      const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement } }
      return typeof spec.widget?.toDOM === 'function'
    })
    expect(embedDeco).toBeDefined()

    const el = (embedDeco!.value.spec as { widget: { toDOM: () => HTMLElement } }).widget.toDOM()
    expect(el.classList.contains('cm-lp-embed-note')).toBe(true)
    expect(el.classList.contains('cm-lp-embed-file')).toBe(false)
  })

  it('resolves a bare image filename to its vault-relative path (e.g. dragged in from a subfolder), not the literal name', () => {
    // Regression test: an `![[image.png]]` embed for a file living in a
    // subfolder must resolve via the directory tree just like Reading mode's
    // renderEmbedNode does — otherwise the <img> requests the bare filename
    // at the vault root and 404s, even though the file exists.
    const directoryTree: DirectoryTree = {
      name: 'root',
      type: 'directory',
      path: '',
      children: [
        {
          name: 'Attachments',
          type: 'directory',
          path: 'Attachments',
          children: [{ name: 'Demo-Bild.png', type: 'file', path: 'Attachments/Demo-Bild.png' }],
        },
      ],
    }
    const state = makeState('![[Demo-Bild.png]]')
    const result = buildWidgetDecorations(state, { vaultId: 'v1', directoryTree })
    const embedDeco = result.decorations.find((r) => {
      const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement } }
      return typeof spec.widget?.toDOM === 'function'
    })
    expect(embedDeco).toBeDefined()

    const img = (embedDeco!.value.spec as { widget: { toDOM: () => HTMLElement } }).widget.toDOM() as HTMLImageElement
    expect(img.src).toContain(encodeURIComponent('Attachments/Demo-Bild.png'))
  })
})

describe('buildWidgetDecorations — app.embedRegistry integration', () => {
  afterEach(() => {
    resetEmbedRegistry()
  })

  const directoryTree: DirectoryTree = {
    name: 'root',
    type: 'directory',
    path: '',
    children: [{ name: 'Drawing.excalidraw.md', type: 'file', path: 'Drawing.excalidraw.md' }],
  }

  function toDOMFor(state: EditorState): HTMLElement {
    const result = buildWidgetDecorations(state, { vaultId: 'v1', directoryTree })
    const embedDeco = result.decorations.find((r) => {
      const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement } }
      return typeof spec.widget?.toDOM === 'function'
    })
    if (!embedDeco) throw new Error('no embed decoration found')
    return (embedDeco.value.spec as { widget: { toDOM: () => HTMLElement } }).widget.toDOM()
  }

  it('delegates to a plugin-registered embed creator instead of the built-in note pipeline', () => {
    // Same regression this registry exists for: the wikilink target's
    // apparent extension ("excalidraw") differs from the resolved file's
    // real one ("md", since the file is "Drawing.excalidraw.md").
    let receivedFile: unknown = null
    registerExtension('excalidraw', (_context, file) => {
      receivedFile = file
      return { load(): void {}, unload(): void {}, loadFile(): void {} }
    })

    const el = toDOMFor(makeState('![[Drawing.excalidraw]]'))
    expect(el.className).toBe('cm-lp-embed-plugin')
    expect(receivedFile).toMatchObject({ path: 'Drawing.excalidraw.md', extension: 'md' })
  })

  it('unloads the plugin embed component on widget destroy', () => {
    let unloaded = false
    registerExtension('excalidraw', () => ({
      load(): void {},
      unload(): void { unloaded = true },
      loadFile(): void {},
    }))

    const state = makeState('![[Drawing.excalidraw]]')
    const result = buildWidgetDecorations(state, { vaultId: 'v1', directoryTree })
    const embedDeco = result.decorations.find((r) => {
      const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement; destroy?: (dom: HTMLElement) => void } }
      return typeof spec.widget?.toDOM === 'function'
    })
    const widget = (embedDeco!.value.spec as { widget: { toDOM: () => HTMLElement; destroy: (dom: HTMLElement) => void } }).widget
    const dom = widget.toDOM()
    widget.destroy(dom)
    expect(unloaded).toBe(true)
  })

  it('falls back to the built-in note pipeline when no creator is registered for the extension', () => {
    const el = toDOMFor(makeState('![[Drawing.excalidraw]]'))
    expect(el.classList.contains('cm-lp-embed-note')).toBe(true)
  })
})

describe('buildWidgetDecorations — frontmatter box', () => {
  function frontmatterWidget(state: EditorState) {
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const deco = result.decorations.find((r) => {
      const spec = r.value.spec as { widget?: { toDOM?: () => HTMLElement } }
      return typeof spec.widget?.toDOM === 'function' && r.from === 0
    })
    return { result, widget: (deco!.value.spec as { widget: { toDOM: (view: EditorView) => HTMLElement; ignoreEvent?: () => boolean } }).widget }
  }

  /** Builds a read-only EditorState (frontmatter falls back to the static text-parsing render). */
  function makeReadOnlyState(doc: string): EditorState {
    return EditorState.create({ doc, extensions: [markdown({ extensions: GFM }), EditorState.readOnly.of(true)] })
  }

  it('replaces the whole --- ... --- block at the document start with one widget', () => {
    const state = makeState('---\ntitle: Hello\ntags: [a, b]\n---\nBody text')
    const { result } = frontmatterWidget(state)
    const fmRange = result.decorations.find((r) => r.from === 0 && state.doc.sliceString(0, r.to).endsWith('---\n'))
    expect(fmRange).toBeDefined()
  })

  it('renders key/value rows from the parsed YAML when read-only', () => {
    const state = makeReadOnlyState('---\ntitle: Hello\n---\nBody')
    const { widget } = frontmatterWidget(state)
    // Unused by the read-only branch, which never dereferences `view`.
    const el = widget.toDOM(undefined as unknown as EditorView)
    expect(el.querySelector('.cm-lp-frontmatter-key')?.textContent).toBe('title')
    expect(el.querySelector('.cm-lp-frontmatter-tag')?.textContent).toBe('Hello')
  })

  it('does not ignore DOM events when read-only, so a click can place the cursor inside the block and reveal raw YAML', () => {
    // Regression test: WidgetType's default ignoreEvent() returns true, which
    // makes CM6 swallow every click on the widget's DOM — the box looked
    // clickable but a click never moved the cursor, so the reveal-on-cursor
    // mechanism in live-preview-extension.ts could never kick in from a click,
    // only via keyboard navigation from an adjacent line.
    const state = makeReadOnlyState('---\ntitle: Hello\n---\nBody')
    const { widget } = frontmatterWidget(state)
    expect(widget.ignoreEvent?.()).toBe(false)
  })

  it('ignores DOM events when editable, so CM6 does not also move its cursor into the block and tear down the mounted editor', () => {
    // The interactive PropertiesEditor (mounted in frontmatter-widget.test.ts)
    // owns all interaction itself. If this returned false, CM6 would resolve
    // every click to a boundary cursor position, which the cursor-aware
    // reveal logic in live-preview-extension.ts reads as "cursor entered the
    // block" — tearing the just-clicked editor down to raw YAML text on the
    // very first click.
    const state = makeState('---\ntitle: Hello\n---\nBody')
    const { widget } = frontmatterWidget(state)
    expect(widget.ignoreEvent?.()).toBe(true)
  })
})
