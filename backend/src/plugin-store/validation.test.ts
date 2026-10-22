import { describe, it, expect } from 'vitest'
import { REPO_FORMAT_PATTERN, storeInstallSchema } from './validation.js'

describe('REPO_FORMAT_PATTERN', () => {
  it.each(['owner/repo', 'a.b/c_d-e', 'liamcain/obsidian-calendar-plugin', '.github/x', 'o/..repo', 'o/repo.'])(
    'accepts %s',
    (repo) => expect(REPO_FORMAT_PATTERN.test(repo)).toBe(true),
  )

  it.each(['../x', 'x/..', './x', 'x/.', '../..', '...//x', 'a/b/c', 'owner', '/repo', 'owner/', 'a b/c'])(
    'rejects %s',
    (repo) => expect(REPO_FORMAT_PATTERN.test(repo)).toBe(false),
  )

  it('is enforced by the install schema', () => {
    expect(storeInstallSchema.safeParse({ pluginId: 'p', repo: '../x' }).success).toBe(false)
    expect(storeInstallSchema.safeParse({ pluginId: 'p', repo: 'o/r' }).success).toBe(true)
  })
})
