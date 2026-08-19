import { describe, it, expect, afterEach } from 'vitest'
import {
  registerFileExplorerRow,
  unregisterFileExplorerRow,
  getFileExplorerItemsMap,
  createFileItemsProxy,
  clearFileExplorerDomRegistry,
} from './file-explorer-dom-registry'

describe('file-explorer-dom-registry', () => {
  afterEach(() => {
    clearFileExplorerDomRegistry()
  })

  it('registers a file row with a TFile-shaped file object', () => {
    const li = document.createElement('li')
    const button = document.createElement('button')
    li.appendChild(button)
    registerFileExplorerRow('notes/hello.md', 'hello.md', 'file', button)

    const item = getFileExplorerItemsMap().get('notes/hello.md')
    expect(item).toBeDefined()
    expect(item?.titleEl).toBe(button)
    expect(item?.selfEl).toBe(li)
    expect(item?.file).toEqual(expect.objectContaining({
      path: 'notes/hello.md',
      name: 'hello.md',
      basename: 'hello',
      extension: 'md',
    }))
  })

  it('registers a folder row with a TFolder-shaped file object', () => {
    const li = document.createElement('li')
    const button = document.createElement('button')
    li.appendChild(button)
    registerFileExplorerRow('notes', 'notes', 'directory', button)

    const item = getFileExplorerItemsMap().get('notes')
    expect(item?.file).toEqual(expect.objectContaining({ path: 'notes', name: 'notes', children: [] }))
    expect((item?.file as { isRoot: () => boolean }).isRoot()).toBe(false)
  })

  it('falls back to the titleEl itself as selfEl when no ancestor <li> exists', () => {
    const button = document.createElement('button')
    registerFileExplorerRow('loose.md', 'loose.md', 'file', button)
    expect(getFileExplorerItemsMap().get('loose.md')?.selfEl).toBe(button)
  })

  it('removes the row on unregister', () => {
    const button = document.createElement('button')
    registerFileExplorerRow('a.md', 'a.md', 'file', button)
    unregisterFileExplorerRow('a.md')
    expect(getFileExplorerItemsMap().has('a.md')).toBe(false)
  })

  it('re-registering the same path overwrites the previous row (last mount wins)', () => {
    const first = document.createElement('button')
    const second = document.createElement('button')
    registerFileExplorerRow('a.md', 'a.md', 'file', first)
    registerFileExplorerRow('a.md', 'a.md', 'file', second)
    expect(getFileExplorerItemsMap().get('a.md')?.titleEl).toBe(second)
  })

  describe('createFileItemsProxy()', () => {
    it('reflects live registry state, not a snapshot', () => {
      const fileItems = createFileItemsProxy()
      expect(fileItems['b.md']).toBeUndefined()

      const button = document.createElement('button')
      registerFileExplorerRow('b.md', 'b.md', 'file', button)
      expect(fileItems['b.md']?.titleEl).toBe(button)

      unregisterFileExplorerRow('b.md')
      expect(fileItems['b.md']).toBeUndefined()
    })

    it('supports "in" and Object.keys() over registered paths', () => {
      const button = document.createElement('button')
      registerFileExplorerRow('c.md', 'c.md', 'file', button)
      const fileItems = createFileItemsProxy()
      expect('c.md' in fileItems).toBe(true)
      expect('missing.md' in fileItems).toBe(false)
      expect(Object.keys(fileItems)).toEqual(['c.md'])
    })
  })
})
