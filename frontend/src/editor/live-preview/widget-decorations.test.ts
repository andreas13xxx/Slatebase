import { describe, it, expect, afterEach, vi } from 'vitest'
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

describe('buildWidgetDecorations — inline base code block', () => {
  const doc = '```base\nviews:\n  - type: table\n    name: Table\n```'

  const widgetsOf = (text: string, basesEnabled: boolean | undefined) =>
    buildWidgetDecorations(makeState(text), { vaultId: 'v1', ...(basesEnabled === undefined ? {} : { basesEnabled }) })
      .decorations.filter((r) => (r.value.spec as { widget?: unknown }).widget !== undefined)

  it('replaces the whole fenced block with one widget', () => {
    const result = buildWidgetDecorations(makeState(doc), { vaultId: 'v1', basesEnabled: true })
    const replaced = result.decorations.filter((r) => (r.value.spec as { widget?: unknown }).widget !== undefined)

    expect(replaced).toHaveLength(1)
    expect(replaced[0]!.from).toBe(0)
    expect(replaced[0]!.to).toBe(doc.length)
    expect(result.hideableRanges).toHaveLength(1)
  })

  it('leaves other languages as a plain code block', () => {
    expect(widgetsOf(doc.replace('```base', '```yaml'), true)).toHaveLength(0)
  })

  it('stays a plain code block while the bases feature is off or unset', () => {
    expect(widgetsOf(doc, false)).toHaveLength(0)
    expect(widgetsOf(doc, undefined)).toHaveLength(0)
  })

  it('matches the language case-insensitively', () => {
    expect(widgetsOf(doc.replace('```base', '```BASE'), true)).toHaveLength(1)
  })

  it('still renders a block whose closing fence has not been typed yet', () => {
    expect(widgetsOf('```base\nviews:\n  - type: table', true)).toHaveLength(1)
  })

  it('treats two blocks with the same source as equal and different source as different', () => {
    const [a] = widgetsOf(doc, true)
    const [b] = widgetsOf(doc, true)
    const [c] = widgetsOf(doc.replace('Table', 'Other'), true)
    const widgetA = (a!.value.spec as { widget: { eq(o: unknown): boolean } }).widget

    expect(widgetA.eq((b!.value.spec as { widget: unknown }).widget)).toBe(true)
    expect(widgetA.eq((c!.value.spec as { widget: unknown }).widget)).toBe(false)
  })

  it('unmounts its React root when CM6 destroys the widget', async () => {
    const [a] = widgetsOf(doc, true)
    const widget = (a!.value.spec as { widget: { toDOM(): HTMLElement; destroy(dom: HTMLElement): void } }).widget
    const dom = widget.toDOM()
    await vi.waitFor(() => expect(dom.textContent).not.toBe(''))

    widget.destroy(dom)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(dom.textContent).toBe('')
  })
})

describe('buildWidgetDecorations — base embed with a view name', () => {
  const tree: DirectoryTree = {
    name: 'root', type: 'directory', path: '',
    children: [{ name: 'Tasks.base', type: 'file', path: 'Tasks.base' }],
  }
  const twoViews = 'views:\n  - type: table\n    name: Alle\n  - type: cards\n    name: Board\n'

  /** Mounts the embed widget for `markdown` and waits until its DOM shows `expected`. */
  async function expectText(markdown: string, expected: string): Promise<void> {
    const apiClient = {
      fetchFileContent: vi.fn().mockResolvedValue({ content: twoViews, isBinary: false }),
      queryBase: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    }
    const result = buildWidgetDecorations(makeState(markdown), { vaultId: 'v1', directoryTree: tree, apiClient, basesEnabled: true })
    const widget = result.decorations
      .map((r) => (r.value.spec as { widget?: { toDOM(): HTMLElement } }).widget)
      .find((w) => w !== undefined)!
    const dom = widget.toDOM()
    await vi.waitFor(() => expect(dom.textContent).toContain(expected))
  }

  it('shows the view named after # in the embed header', async () => {
    await expectText('![[Tasks.base#Board]]', 'Tasks.base › Board')
  })

  it('reports an unknown view name', async () => {
    await expectText('![[Tasks.base#Fehlt]]', 'Ansicht nicht gefunden: Fehlt')
  })

  it('cuts a |display suffix off the view name', async () => {
    await expectText('![[Tasks.base#Board|Anzeige]]', 'Tasks.base › Board')
  })

  it('looks up the note it sits in as the host of this.*', async () => {
    const thisBase = 'filters: file.hasLink(this.file)\nviews:\n  - type: table\n    name: Alle\n'
    const queryBase = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    const apiClient = { fetchFileContent: vi.fn().mockResolvedValue({ content: thisBase, isBinary: false }), queryBase }
    const result = buildWidgetDecorations(makeState('![[Tasks.base]]'), {
      vaultId: 'v1', directoryTree: tree, apiClient, basesEnabled: true, sourcePath: 'Projekte/Plan.md',
    })
    const widget = result.decorations
      .map((r) => (r.value.spec as { widget?: { toDOM(): HTMLElement } }).widget)
      .find((w) => w !== undefined)!
    widget.toDOM()

    await vi.waitFor(() => expect(queryBase).toHaveBeenCalledWith('v1', expect.objectContaining({ filters: { path: 'Projekte/Plan.md' } })))
  })

  it('does not treat a .base embed as a Base while the bases feature is off', async () => {
    const apiClient = { fetchFileContent: vi.fn().mockResolvedValue({ content: twoViews, isBinary: false }), queryBase: vi.fn() }
    const result = buildWidgetDecorations(makeState('![[Tasks.base]]'), { vaultId: 'v1', directoryTree: tree, apiClient })
    const widget = result.decorations
      .map((r) => (r.value.spec as { widget?: { toDOM(): HTMLElement } }).widget)
      .find((w) => w !== undefined)!
    const dom = widget.toDOM()

    expect(dom.className).not.toContain('cm-lp-embed-base')
    expect(apiClient.queryBase).not.toHaveBeenCalled()
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
