import { describe, it, expect } from 'vitest'
import { resolveAttachmentTargetDir, resolveMarkdownLinkTarget } from './internalLink'
describe('resolveAttachmentTargetDir (attachmentFolderPath of app.json)', () => {
  it("'/' is the vault root", () => {
    expect(resolveAttachmentTargetDir('/', 'notes/a.md')).toBe('')
  })

  it("'' and './' are the folder of the note", () => {
    expect(resolveAttachmentTargetDir('', 'notes/a.md')).toBe('notes')
    expect(resolveAttachmentTargetDir('./', 'notes/a.md')).toBe('notes')
    expect(resolveAttachmentTargetDir('./', 'a.md')).toBe('')
  })

  it("'./name' is a subfolder of the note's folder", () => {
    expect(resolveAttachmentTargetDir('./attachments', 'notes/a.md')).toBe('notes/attachments')
    expect(resolveAttachmentTargetDir('./attachments/', 'a.md')).toBe('attachments')
  })

  it('anything else is a folder relative to the vault root, without surrounding slashes', () => {
    expect(resolveAttachmentTargetDir('Attachments', 'notes/a.md')).toBe('Attachments')
    expect(resolveAttachmentTargetDir('/Assets/img/', 'notes/a.md')).toBe('Assets/img')
  })
})

describe('resolveMarkdownLinkTarget', () => {
  it('strips <> and resolves ./ against the note folder', () => {
    expect(resolveMarkdownLinkTarget('<./01 Nested objects.md>', 'a/Index.md')).toBe('a/01 Nested objects.md')
    expect(resolveMarkdownLinkTarget('<./01 Nested objects.md>', 'Index.md')).toBe('01 Nested objects.md')
  })

  it('resolves ../, decodes %20 and drops anchors', () => {
    expect(resolveMarkdownLinkTarget('../b/My%20note.md#Heading', 'a/c/x.md')).toBe('a/b/My note.md')
  })

  it('adds .md without extension and returns null for pure anchors', () => {
    expect(resolveMarkdownLinkTarget('Note', 'a/x.md')).toBe('a/Note.md')
    expect(resolveMarkdownLinkTarget('#Heading', 'a/x.md')).toBeNull()
  })

  it('treats a leading slash as vault-rooted', () => {
    expect(resolveMarkdownLinkTarget('/top/n.md', 'a/x.md')).toBe('top/n.md')
  })
})
