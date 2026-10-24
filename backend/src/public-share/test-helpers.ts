// Test doubles for the public share module (hand-written, no mocking library).

import type { DirectoryTree } from '../vault/index.js'
import type { IPublicShareStore } from './public-share-store.js'
import type { IPublicShareVaultAccess, PublicShare } from './types.js'

/** Builds a DirectoryTree from a list of vault-relative file paths. */
export function buildTree(paths: string[]): DirectoryTree {
  const root: DirectoryTree = { name: 'vault', type: 'directory', path: '', children: [] }
  for (const filePath of paths) {
    const parts = filePath.split('/')
    let node = root
    parts.forEach((name, index) => {
      const isFile = index === parts.length - 1
      const nodePath = parts.slice(0, index + 1).join('/')
      let child = node.children!.find((c) => c.name === name)
      if (child === undefined) {
        child = isFile
          ? { name, type: 'file', path: nodePath }
          : { name, type: 'directory', path: nodePath, children: [] }
        node.children!.push(child)
      }
      node = child
    })
  }
  return root
}

/** In-memory vault: text files, binary files, and a read counter. */
export function createMockVaultAccess(
  files: Record<string, string | Buffer>,
  options: { treeOnly?: string[]; unreadable?: string[] } = {},
): IPublicShareVaultAccess & { reads: string[] } {
  const reads: string[] = []
  return {
    reads,
    async getTree() {
      return buildTree([...Object.keys(files), ...(options.treeOnly ?? [])])
    },
    async readText(_vaultId, filePath) {
      reads.push(filePath)
      if (options.unreadable?.includes(filePath)) return null
      const value = files[filePath]
      return typeof value === 'string' ? value : null
    },
    async readBinary(_vaultId, filePath) {
      const value = files[filePath]
      return Buffer.isBuffer(value) ? value : typeof value === 'string' ? Buffer.from(value) : null
    },
  }
}

/** In-memory store with the same contract as the file-backed one. */
export function createMockStore(initial: PublicShare[] = []): IPublicShareStore & { shares: PublicShare[] } {
  const state = { shares: [...initial] }
  return {
    get shares() {
      return state.shares
    },
    async list() {
      return [...state.shares]
    },
    async mutate(fn) {
      state.shares = fn([...state.shares])
      return [...state.shares]
    },
  }
}
