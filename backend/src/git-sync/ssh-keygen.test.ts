// SshKeyGenerator integration tests — exercise the real `ssh-keygen` binary.

import { describe, it, expect } from 'vitest'
import { SshKeyGenerator } from './ssh-keygen.js'
import { GitCommandFailedError } from './errors.js'

describe('SshKeyGenerator', () => {
  it('generates a passphrase-less ed25519 keypair with proper PEM framing', async () => {
    const generator = new SshKeyGenerator()
    const { privateKey, publicKey } = await generator.generateKeyPair('slatebase-sync@test-vault')

    expect(privateKey).toContain('-----BEGIN OPENSSH PRIVATE KEY-----')
    expect(privateKey).toContain('-----END OPENSSH PRIVATE KEY-----')
    expect(publicKey).toMatch(/^ssh-ed25519 /)
    expect(publicKey).toContain('slatebase-sync@test-vault')
  })

  it('generates a different keypair on each call', async () => {
    const generator = new SshKeyGenerator()
    const first = await generator.generateKeyPair('a')
    const second = await generator.generateKeyPair('b')
    expect(first.publicKey).not.toBe(second.publicKey)
  })

  it('derives the matching public key from a freshly generated private key', async () => {
    const generator = new SshKeyGenerator()
    const { privateKey, publicKey } = await generator.generateKeyPair('roundtrip-test')
    const derived = await generator.derivePublicKey(privateKey)
    // ssh-keygen -y re-derives without the trailing comment; compare just the key material.
    expect(derived.split(' ').slice(0, 2)).toEqual(publicKey.split(' ').slice(0, 2))
  })

  it('tolerates CRLF line endings in the private key (Windows textarea paste)', async () => {
    const generator = new SshKeyGenerator()
    const { privateKey, publicKey } = await generator.generateKeyPair('crlf-test')
    const crlfKey = privateKey.replace(/\n/g, '\r\n')
    const derived = await generator.derivePublicKey(crlfKey)
    expect(derived.split(' ').slice(0, 2)).toEqual(publicKey.split(' ').slice(0, 2))
  })

  it('rejects a malformed private key', async () => {
    const generator = new SshKeyGenerator()
    await expect(generator.derivePublicKey('not a real key')).rejects.toThrow(GitCommandFailedError)
  })
})
