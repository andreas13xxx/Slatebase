import { describe, it, expect } from 'vitest'
import type { DirectoryTree } from '../types'
import { folderExists, resolveNewNoteFolder } from './newNoteLocation'

const dir = (name: string, path: string, children: DirectoryTree[] = []): DirectoryTree => ({ name, path, type: 'directory', children })
const file = (name: string, path: string): DirectoryTree => ({ name, path, type: 'file' })

const tree = dir('vault', '', [
  dir('Inbox', 'Inbox', [dir('Ideas', 'Inbox/Ideas', [file('a.md', 'Inbox/Ideas/a.md')])]),
  file('top.md', 'top.md'),
])

describe('resolveNewNoteFolder', () => {
  it('root is the vault root', () => {
    expect(resolveNewNoteFolder('root', 'Inbox', 'Inbox/Ideas/a.md', tree)).toBe('')
  })

  it('current is the folder of the open note, the root for a note at the top or none open', () => {
    expect(resolveNewNoteFolder('current', '', 'Inbox/Ideas/a.md', tree)).toBe('Inbox/Ideas')
    expect(resolveNewNoteFolder('current', '', 'top.md', tree)).toBe('')
    expect(resolveNewNoteFolder('current', '', null, tree)).toBe('')
    expect(resolveNewNoteFolder('current', '', '__graph__', tree)).toBe('')
  })

  it('folder is the configured folder, cleaned up', () => {
    expect(resolveNewNoteFolder('folder', 'Inbox', null, tree)).toBe('Inbox')
    expect(resolveNewNoteFolder('folder', '/Inbox//Ideas/', null, tree)).toBe('Inbox/Ideas')
    expect(resolveNewNoteFolder('folder', 'Inbox\\Ideas', null, tree)).toBe('Inbox/Ideas')
  })

  it('falls back to the root for a folder that does not exist, is empty, or leaves the vault', () => {
    expect(resolveNewNoteFolder('folder', 'Nope', null, tree)).toBe('')
    expect(resolveNewNoteFolder('folder', '', null, tree)).toBe('')
    expect(resolveNewNoteFolder('folder', '../outside', null, tree)).toBe('')
    expect(resolveNewNoteFolder('folder', 'top.md', null, tree)).toBe('')
    expect(resolveNewNoteFolder('folder', 'Inbox', null, null)).toBe('')
  })
})

describe('folderExists', () => {
  it('finds nested folders but not files', () => {
    expect(folderExists(tree, 'Inbox/Ideas')).toBe(true)
    expect(folderExists(tree, 'Inbox/Ideas/a.md')).toBe(false)
  })
})
