import { describe, it, expect } from 'vitest'
import { resolveAttachmentTargetDir } from './internalLink'
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
