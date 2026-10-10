import { describe, it, expect, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { findHeadingSectionAtCursor, sanitizeFileNameFromHeading, extractRangeToNewFile, rewriteExtractedLinks } from './noteComposer'
import type { IApiClient } from '../api'
import type { DirectoryTree } from '../types'

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

describe('rewriteExtractedLinks', () => {
  // Two files named "Note" in different folders: a bare [[Note]] in projects/
  // resolves to projects/Note.md (same folder), but from archive/ it would
  // resolve elsewhere — the exact case the rewrite exists for.
  const tree: DirectoryTree = {
    name: 'root', type: 'directory', path: '',
    children: [
      {
        name: 'projects', type: 'directory', path: 'projects',
        children: [
          { name: 'Doc.md', type: 'file', path: 'projects/Doc.md' },
          { name: 'Note.md', type: 'file', path: 'projects/Note.md' },
        ],
      },
      {
        name: 'archive', type: 'directory', path: 'archive',
        children: [
          { name: 'Note.md', type: 'file', path: 'archive/Note.md' },
        ],
      },
    ],
  }

  it('returns content unchanged when the tree is null', () => {
    expect(rewriteExtractedLinks('see [[Note]]', 'projects/Doc.md', 'archive/Doc.md', null)).toBe('see [[Note]]')
  })

  it('leaves links that resolve the same from both locations untouched', () => {
    // Same source + destination folder → resolution identical, no rewrite.
    const out = rewriteExtractedLinks('see [[Note]]', 'projects/Doc.md', 'projects/Extracted.md', tree)
    expect(out).toBe('see [[Note]]')
  })

  it('pins a bare link whose resolution changes to an explicit path', () => {
    // From projects/ the bare [[Note]] means projects/Note.md; extracting into
    // archive/ would make it mean archive/Note.md, so it is rewritten explicit.
    const out = rewriteExtractedLinks('see [[Note]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('see [[projects/Note]]')
  })

  it('preserves display text when rewriting', () => {
    const out = rewriteExtractedLinks('see [[Note|the note]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('see [[projects/Note|the note]]')
  })

  it('leaves already path-qualified links untouched', () => {
    const out = rewriteExtractedLinks('see [[archive/Note]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('see [[archive/Note]]')
  })

  it('rewrites a link that carries a #heading (previously a silent no-op)', () => {
    // Reconstructing the link from parsed fields failed to match the real text
    // for heading/alias links, so they were silently left unchanged. The raw
    // token scan edits only the target and keeps the heading intact.
    const out = rewriteExtractedLinks('see [[Note#Intro]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('see [[projects/Note#Intro]]')
  })

  it('rewrites a link with both #heading and |alias, preserving both', () => {
    const out = rewriteExtractedLinks('see [[Note#Intro|the intro]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('see [[projects/Note#Intro|the intro]]')
  })

  it('rewrites a link with a block ref, preserving the ^id', () => {
    const out = rewriteExtractedLinks('see [[Note#^abc123]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('see [[projects/Note#^abc123]]')
  })

  it('leaves image embeds (![[...]]) untouched', () => {
    const out = rewriteExtractedLinks('![[Note]]', 'projects/Doc.md', 'archive/Extracted.md', tree)
    expect(out).toBe('![[Note]]')
  })

  it('rewrites multiple links in one pass', () => {
    const out = rewriteExtractedLinks(
      'first [[Note]] then [[Note#Intro|x]]',
      'projects/Doc.md',
      'archive/Extracted.md',
      tree,
    )
    expect(out).toBe('first [[projects/Note]] then [[projects/Note#Intro|x]]')
  })
})
