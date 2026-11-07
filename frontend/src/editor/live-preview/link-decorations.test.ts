import { describe, it, expect, vi, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { createWikilinkRegex, resolveWikilinkMatchTarget, buildLinkDecorations, createLinkClickHandler } from './link-decorations'

/** Builds an EditorState with the same markdown/GFM setup used by CodeMirrorEditor.tsx. */
function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
}

describe('createWikilinkRegex', () => {
  it('matches a plain wikilink', () => {
    const regex = createWikilinkRegex()
    const match = regex.exec('See [[Features/Wikilinks]]')
    expect(match?.[1]).toBe('Features/Wikilinks')
    expect(match?.[2]).toBeUndefined()
  })

  it('matches an aliased wikilink with an unescaped pipe', () => {
    const regex = createWikilinkRegex()
    const match = regex.exec('[[Features/Wikilinks|Wikilinks]]')
    expect(match?.[1]).toBe('Features/Wikilinks')
    expect(match?.[2]).toBe('Wikilinks')
  })

  it('captures a trailing backslash on the target when the pipe is escaped', () => {
    // Documents the raw regex behavior that resolveWikilinkMatchTarget cleans up.
    const regex = createWikilinkRegex()
    const match = regex.exec('[[Features/Wikilinks\\|Wikilinks]]')
    expect(match?.[1]).toBe('Features/Wikilinks\\')
    expect(match?.[2]).toBe('Wikilinks')
  })

  it('returns a fresh, non-shared instance on each call', () => {
    const a = createWikilinkRegex()
    a.exec('[[One]] [[Two]]')
    const b = createWikilinkRegex()
    expect(b.lastIndex).toBe(0)
  })
})

describe('resolveWikilinkMatchTarget', () => {
  it('strips a trailing backslash when there is an alias (escaped pipe)', () => {
    expect(resolveWikilinkMatchTarget('Features/Wikilinks\\', true)).toBe('Features/Wikilinks')
  })

  it('leaves the target untouched when there is no alias', () => {
    expect(resolveWikilinkMatchTarget('Features/Wikilinks\\', false)).toBe('Features/Wikilinks\\')
  })

  it('leaves a target without a trailing backslash untouched', () => {
    expect(resolveWikilinkMatchTarget('Features/Wikilinks', true)).toBe('Features/Wikilinks')
  })
})

describe('buildLinkDecorations code-block guard', () => {
  it('does not decorate a wikilink inside a fenced code block', () => {
    const state = makeState('```\n[[Dateiname]]\n```')
    const result = buildLinkDecorations(state, {})
    expect(result.decorations).toHaveLength(0)
  })

  it('does not decorate a wikilink inside an inline code span', () => {
    const state = makeState('Use `[[Dateiname]]` to link to a file.')
    const result = buildLinkDecorations(state, {})
    expect(result.decorations).toHaveLength(0)
  })

  it('still decorates a real wikilink next to a fenced code block containing one', () => {
    const state = makeState('```\n[[Dateiname]]\n```\n\nSee [[RealLink]].')
    const result = buildLinkDecorations(state, {})

    // 3 decorations for [[RealLink]]: hide `[[`, mark the target, hide `]]`.
    expect(result.decorations).toHaveLength(3)
    expect(JSON.stringify(result.decorations)).toContain('"data-target":"RealLink"')
  })
})

describe('createLinkClickHandler Ctrl/Cmd+Click scheme handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Mounts a view with a fake `.cm-lp-link` element and Ctrl+clicks it. */
  function ctrlClickLink(url: string) {
    const onInternalLinkClick = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({
      state: EditorState.create({ doc: '', extensions: [createLinkClickHandler({ onInternalLinkClick })] }),
      parent,
    })
    const link = document.createElement('span')
    link.className = 'cm-lp-link'
    link.setAttribute('data-url', url)
    view.contentDOM.appendChild(link)
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ctrlKey: true }))
    view.destroy()
    parent.remove()
    return { openSpy, onInternalLinkClick }
  }

  it.each(['https://example.com/a', 'http://example.com/a', 'HTTPS://example.com/a'])('opens %s via window.open', (url) => {
    const { openSpy, onInternalLinkClick } = ctrlClickLink(url)
    expect(openSpy).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
    expect(onInternalLinkClick).not.toHaveBeenCalled()
  })

  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)'])(
    'does not call window.open for %s',
    (url) => {
      const { openSpy, onInternalLinkClick } = ctrlClickLink(url)
      expect(openSpy).not.toHaveBeenCalled()
      expect(onInternalLinkClick).toHaveBeenCalledWith(url)
    },
  )
})
