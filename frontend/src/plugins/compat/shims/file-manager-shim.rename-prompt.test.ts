import { describe, it, expect, vi, afterEach } from 'vitest'
import { FileManagerShim } from './file-manager-shim'
import type { IVaultShim, TFile } from '../types'

vi.mock('../../../state/fileNavigation', () => ({
  renameInExplorer: vi.fn(),
}))

import { renameInExplorer } from '../../../state/fileNavigation'

describe('FileManagerShim.promptForFileRename', () => {
  afterEach(() => vi.clearAllMocks())

  it('hands the file over to the explorer inline rename', async () => {
    const fm = new FileManagerShim({} as IVaultShim)
    await fm.promptForFileRename({ path: 'a/b.md', name: 'b.md' } as TFile)
    expect(renameInExplorer).toHaveBeenCalledWith('a/b.md', 'file')
  })
})
