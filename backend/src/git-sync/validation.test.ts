import { describe, it, expect } from 'vitest'
import { createGitSyncRemoteSchema, updateGitSyncRemoteSchema, isValidGitBranchName } from './validation.js'

const BASE_INPUT = {
  name: 'Origin',
  remoteUrl: 'https://example.invalid/repo.git',
  intervalMinutes: 15,
}

const FRAMED_KEY = [
  '-----BEGIN OPENSSH PRIVATE KEY-----',
  'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMw==',
  '-----END OPENSSH PRIVATE KEY-----',
].join('\n')

// The exact failure mode this schema guards against: only the base64 body
// was pasted, without the framing lines. This produces a valid-looking but
// unparsable key file, and `ssh` reports it as an opaque, low-level
// "error in libcrypto: unsupported" rather than "missing header/footer".
const UNFRAMED_KEY_BODY = 'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMw=='

describe('createGitSyncRemoteSchema', () => {
  it('accepts an HTTPS-token remote with any non-empty credential', () => {
    const result = createGitSyncRemoteSchema.safeParse({ ...BASE_INPUT, authMethod: 'https-token', credential: 'ghp_abc123' })
    expect(result.success).toBe(true)
  })

  it('accepts an SSH-key remote whose credential includes the BEGIN/END framing', () => {
    const result = createGitSyncRemoteSchema.safeParse({ ...BASE_INPUT, authMethod: 'ssh-key', credential: FRAMED_KEY })
    expect(result.success).toBe(true)
  })

  it('rejects an SSH-key remote whose credential is missing the BEGIN/END framing', () => {
    const result = createGitSyncRemoteSchema.safeParse({ ...BASE_INPUT, authMethod: 'ssh-key', credential: UNFRAMED_KEY_BODY })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['credential'])
      expect(result.error.issues[0]?.message).toMatch(/BEGIN/)
    }
  })
})

describe('updateGitSyncRemoteSchema', () => {
  it('rejects switching to ssh-key with an unframed credential', () => {
    const result = updateGitSyncRemoteSchema.safeParse({ authMethod: 'ssh-key', credential: UNFRAMED_KEY_BODY })
    expect(result.success).toBe(false)
  })

  it('accepts updating other fields without touching authMethod/credential', () => {
    const result = updateGitSyncRemoteSchema.safeParse({ intervalMinutes: 30 })
    expect(result.success).toBe(true)
  })

  it('accepts an authMethod change to ssh-key together with a framed credential', () => {
    const result = updateGitSyncRemoteSchema.safeParse({ authMethod: 'ssh-key', credential: FRAMED_KEY })
    expect(result.success).toBe(true)
  })
})

describe('isValidGitBranchName', () => {
  it('accepts common branch names', () => {
    expect(isValidGitBranchName('main')).toBe(true)
    expect(isValidGitBranchName('feature/foo')).toBe(true)
  })

  it('rejects unsafe or malformed names', () => {
    expect(isValidGitBranchName('')).toBe(false)
    expect(isValidGitBranchName('-leading-dash')).toBe(false)
    expect(isValidGitBranchName('has..dots')).toBe(false)
    expect(isValidGitBranchName('ends.lock')).toBe(false)
  })
})
