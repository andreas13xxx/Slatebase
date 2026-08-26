import { describe, it, expect, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { findHeadingSectionAtCursor, sanitizeFileNameFromHeading, extractRangeToNewFile } from './noteComposer'
import type { IApiClient } from '../api'

function makeView(doc: string, cursorPos?: number): EditorView {
  const view = new EditorView({ state: EditorState.create({ doc }), parent: document.body })
  if (cursorPos !== undefined) {
    view.dispatch({ selection: { anchor: cursorPos } })
  }
  return view
}

describe('findHeadingSectionAtCursor', () => {
  it('returns null when there is no heading above the cursor', () => {
    const view = makeView('Just plain text.')
    expect(findHeadingSectionAtCursor(view)).toBeNull()
    view.destroy()
  })

  it('captures the section from the heading through the next same-level heading', () => {
    const doc = '# Title\n\nIntro.\n\n## Section A\n\nBody A.\n\n## Section B\n\nBody B.'
    const cursorPos = doc.indexOf('Body A')
    const view = makeView(doc, cursorPos)

    const section = findHeadingSectionAtCursor(view)

    expect(section).not.toBeNull()
    expect(section!.headingText).toBe('Section A')
    // Includes the blank separator line before the next heading.
    expect(view.state.doc.sliceString(section!.from, section!.to)).toBe('## Section A\n\nBody A.\n')
    view.destroy()
  })

  it('stops at a higher-level heading, not just any heading', () => {
    const doc = '# Title\n\n## Section A\n\n### Sub A1\n\nDeep.\n\n## Section B'
    const cursorPos = doc.indexOf('Deep')
    const view = makeView(doc, cursorPos)

    const section = findHeadingSectionAtCursor(view)

    expect(section!.headingText).toBe('Sub A1')
    expect(view.state.doc.sliceString(section!.from, section!.to)).toBe('### Sub A1\n\nDeep.\n')
    view.destroy()
  })

  it('extends to end of document when there is no following heading', () => {
    const doc = '# Title\n\n## Last Section\n\nThe end.'
    const cursorPos = doc.indexOf('The end')
    const view = makeView(doc, cursorPos)

    const section = findHeadingSectionAtCursor(view)

    expect(section!.to).toBe(doc.length)
    view.destroy()
  })
})

describe('sanitizeFileNameFromHeading', () => {
  it('strips characters invalid in file paths', () => {
    expect(sanitizeFileNameFromHeading('A/B: C*D?"E<F>G|H')).toBe('AB CDEFGH')
  })

  it('collapses repeated whitespace', () => {
    expect(sanitizeFileNameFromHeading('Too    many   spaces')).toBe('Too many spaces')
  })

  it('falls back to "Untitled" when nothing is left after sanitizing', () => {
    expect(sanitizeFileNameFromHeading('///')).toBe('Untitled')
  })
})

describe('extractRangeToNewFile', () => {
  it('saves the extracted range as a new file and replaces it with a wikilink', async () => {
    const doc = '# Title\n\n## Section A\n\nBody A.\n\n## Section B\n\nBody B.'
    const view = makeView(doc)
    const from = doc.indexOf('## Section A')
    const to = doc.indexOf('## Section B') // exclusive, trims trailing blank line via caller-supplied range in practice
    const saveFile = vi.fn().mockResolvedValue(undefined)
    const apiClient = { saveFile } as unknown as IApiClient

    await extractRangeToNewFile(view, { from, to }, 'notes/Doc.md', 'Section A', 'vault-1', apiClient)

    expect(saveFile).toHaveBeenCalledWith('vault-1', 'notes/Section A.md', doc.slice(from, to))
    expect(view.state.doc.toString()).toBe(`# Title\n\n[[Section A]]## Section B\n\nBody B.`)
    view.destroy()
  })

  it('places the new file in the same directory as the source', async () => {
    const doc = 'Selected text'
    const view = makeView(doc)
    const saveFile = vi.fn().mockResolvedValue(undefined)
    const apiClient = { saveFile } as unknown as IApiClient

    await extractRangeToNewFile(view, { from: 0, to: doc.length }, 'projects/sub/Doc.md', 'Extracted', 'vault-1', apiClient)

    expect(saveFile).toHaveBeenCalledWith('vault-1', 'projects/sub/Extracted.md', 'Selected text')
    view.destroy()
  })

  it('strips a redundant .md suffix from the given fileName', async () => {
    const doc = 'text'
    const view = makeView(doc)
    const saveFile = vi.fn().mockResolvedValue(undefined)
    const apiClient = { saveFile } as unknown as IApiClient

    await extractRangeToNewFile(view, { from: 0, to: 4 }, 'Doc.md', 'Extracted.md', 'vault-1', apiClient)

    expect(saveFile).toHaveBeenCalledWith('vault-1', 'Extracted.md', 'text')
    view.destroy()
  })
})
