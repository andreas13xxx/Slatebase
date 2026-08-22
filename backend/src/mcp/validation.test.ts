import { describe, it, expect } from 'vitest'
import {
  createTokenSchema,
  vaultIdParamSchema,
  getVaultStructureParamsSchema,
  searchVaultParamsSchema,
  readFileParamsSchema,
  writeFileParamsSchema,
  createDirectoryParamsSchema,
  deleteFileParamsSchema,
  moveFileParamsSchema,
  renameFileParamsSchema,
} from './validation.js'

describe('createTokenSchema', () => {
  it('accepts a valid name and expiry', () => {
    expect(createTokenSchema.safeParse({ name: 'My Token', expiryDays: 30 }).success).toBe(true)
  })

  it('rejects an empty name', () => {
    expect(createTokenSchema.safeParse({ name: '', expiryDays: 30 }).success).toBe(false)
  })

  it('rejects a name over 64 characters', () => {
    expect(createTokenSchema.safeParse({ name: 'a'.repeat(65), expiryDays: 30 }).success).toBe(false)
  })

  it('rejects expiryDays outside the 7-365 range', () => {
    expect(createTokenSchema.safeParse({ name: 'x', expiryDays: 6 }).success).toBe(false)
    expect(createTokenSchema.safeParse({ name: 'x', expiryDays: 366 }).success).toBe(false)
  })

  it('rejects a non-integer expiryDays', () => {
    expect(createTokenSchema.safeParse({ name: 'x', expiryDays: 7.5 }).success).toBe(false)
  })
})

describe('vaultIdParamSchema / getVaultStructureParamsSchema', () => {
  it('accepts a non-empty vaultId', () => {
    expect(vaultIdParamSchema.safeParse({ vaultId: 'v1' }).success).toBe(true)
    expect(getVaultStructureParamsSchema.safeParse({ vaultId: 'v1' }).success).toBe(true)
  })

  it('rejects an empty vaultId', () => {
    expect(vaultIdParamSchema.safeParse({ vaultId: '' }).success).toBe(false)
    expect(getVaultStructureParamsSchema.safeParse({ vaultId: '' }).success).toBe(false)
  })
})

describe('searchVaultParamsSchema', () => {
  it('accepts a valid query and applies the default maxResults', () => {
    const result = searchVaultParamsSchema.safeParse({ vaultId: 'v1', query: 'hello' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.maxResults).toBe(20)
  })

  it('rejects a whitespace-only query', () => {
    expect(searchVaultParamsSchema.safeParse({ vaultId: 'v1', query: '   ' }).success).toBe(false)
  })

  it('rejects a query over 500 characters', () => {
    expect(searchVaultParamsSchema.safeParse({ vaultId: 'v1', query: 'a'.repeat(501) }).success).toBe(false)
  })

  it('rejects maxResults outside the 1-100 range', () => {
    expect(searchVaultParamsSchema.safeParse({ vaultId: 'v1', query: 'x', maxResults: 0 }).success).toBe(false)
    expect(searchVaultParamsSchema.safeParse({ vaultId: 'v1', query: 'x', maxResults: 101 }).success).toBe(false)
  })

  it('accepts an explicit maxResults within range', () => {
    const result = searchVaultParamsSchema.safeParse({ vaultId: 'v1', query: 'x', maxResults: 50 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.maxResults).toBe(50)
  })
})

describe('readFileParamsSchema / createDirectoryParamsSchema / deleteFileParamsSchema', () => {
  it('accepts valid vaultId + path', () => {
    expect(readFileParamsSchema.safeParse({ vaultId: 'v1', path: 'a.md' }).success).toBe(true)
    expect(createDirectoryParamsSchema.safeParse({ vaultId: 'v1', path: 'folder' }).success).toBe(true)
    expect(deleteFileParamsSchema.safeParse({ vaultId: 'v1', path: 'a.md' }).success).toBe(true)
  })

  it('rejects a missing path', () => {
    expect(readFileParamsSchema.safeParse({ vaultId: 'v1', path: '' }).success).toBe(false)
    expect(createDirectoryParamsSchema.safeParse({ vaultId: 'v1', path: '' }).success).toBe(false)
    expect(deleteFileParamsSchema.safeParse({ vaultId: 'v1', path: '' }).success).toBe(false)
  })
})

describe('writeFileParamsSchema', () => {
  it('accepts content without ifMatch', () => {
    const result = writeFileParamsSchema.safeParse({ vaultId: 'v1', path: 'a.md', content: 'hello' })
    expect(result.success).toBe(true)
  })

  it('accepts an optional ifMatch etag', () => {
    const result = writeFileParamsSchema.safeParse({ vaultId: 'v1', path: 'a.md', content: 'hi', ifMatch: 'etag-1' })
    expect(result.success).toBe(true)
  })

  it('rejects a missing vaultId', () => {
    expect(writeFileParamsSchema.safeParse({ vaultId: '', path: 'a.md', content: 'hi' }).success).toBe(false)
  })
})

describe('moveFileParamsSchema / renameFileParamsSchema', () => {
  it('accepts a valid move request', () => {
    expect(moveFileParamsSchema.safeParse({ vaultId: 'v1', sourcePath: 'a.md', destinationPath: 'b.md' }).success).toBe(true)
  })

  it('rejects a move request missing destinationPath', () => {
    expect(moveFileParamsSchema.safeParse({ vaultId: 'v1', sourcePath: 'a.md', destinationPath: '' }).success).toBe(false)
  })

  it('accepts a valid rename request', () => {
    expect(renameFileParamsSchema.safeParse({ vaultId: 'v1', path: 'a.md', newName: 'b.md' }).success).toBe(true)
  })

  it('rejects a newName over 255 characters', () => {
    expect(renameFileParamsSchema.safeParse({ vaultId: 'v1', path: 'a.md', newName: 'a'.repeat(256) }).success).toBe(false)
  })
})
