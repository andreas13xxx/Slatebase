import { describe, it, expect } from 'vitest'
import { isSupportedFile, filterUnsupportedFiles } from './supportedFiles'
import type { DirectoryTree } from '../types'

describe('isSupportedFile', () => {
  it('accepts notes, canvas and base', () => {
    expect(isSupportedFile('Note.md')).toBe(true)
    expect(isSupportedFile('Board.canvas')).toBe(true)
    expect(isSupportedFile('Query.base')).toBe(true)
  })

  it('accepts embeddable media', () => {
    expect(isSupportedFile('pic.png')).toBe(true)
    expect(isSupportedFile('doc.pdf')).toBe(true)
    expect(isSupportedFile('song.mp3')).toBe(true)
    expect(isSupportedFile('clip.mp4')).toBe(true)
  })

  it('is case-insensitive on the extension', () => {
    expect(isSupportedFile('IMG.PNG')).toBe(true)
  })

  it('rejects unknown extensions and extensionless names', () => {
    expect(isSupportedFile('data.xlsx')).toBe(false)
    expect(isSupportedFile('archive.zip')).toBe(false)
    expect(isSupportedFile('Makefile')).toBe(false)
    expect(isSupportedFile('.dotfile')).toBe(false)
  })
})

function dir(name: string, children: DirectoryTree[]): DirectoryTree {
  return { name, path: name, type: 'directory', children }
}
function file(name: string): DirectoryTree {
  return { name, path: name, type: 'file' }
}

describe('filterUnsupportedFiles', () => {
  it('removes unsupported files but keeps supported ones', () => {
    const tree = dir('root', [file('a.md'), file('b.xlsx'), file('c.png')])
    const result = filterUnsupportedFiles(tree)
    expect(result.children?.map((c) => c.name)).toEqual(['a.md', 'c.png'])
  })

  it('keeps folders even when they become empty', () => {
    const tree = dir('root', [dir('empty', [file('x.zip')]), file('ok.md')])
    const result = filterUnsupportedFiles(tree)
    expect(result.children?.map((c) => c.name)).toEqual(['empty', 'ok.md'])
    const emptyDir = result.children?.find((c) => c.name === 'empty')
    expect(emptyDir?.children).toEqual([])
  })

  it('filters recursively into nested folders', () => {
    const tree = dir('root', [dir('sub', [file('keep.md'), file('drop.bin')])])
    const result = filterUnsupportedFiles(tree)
    const sub = result.children?.[0]
    expect(sub?.children?.map((c) => c.name)).toEqual(['keep.md'])
  })

  it('does not mutate the input tree', () => {
    const tree = dir('root', [file('a.md'), file('b.xlsx')])
    filterUnsupportedFiles(tree)
    expect(tree.children?.length).toBe(2)
  })
})
