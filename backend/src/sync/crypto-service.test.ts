import { describe, it, expect } from 'vitest'
import { CryptoService } from './crypto-service.js'

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('CryptoService constructor', () => {
  it('throws when secret is empty string', () => {
    expect(() => new CryptoService('')).toThrow('SLATEBASE_SYNC_SECRET must be set and non-empty')
  })

  it('throws when secret is whitespace only', () => {
    expect(() => new CryptoService('   ')).toThrow('SLATEBASE_SYNC_SECRET must be set and non-empty')
  })

  it('creates instance with valid secret', () => {
    const service = new CryptoService('my-test-secret')
    expect(service).toBeInstanceOf(CryptoService)
  })
})

// ─── encrypt / decrypt (Credential Encryption) ──────────────────────────────

describe('encrypt / decrypt', () => {
  const secret = 'test-server-secret-for-crypto'
  const service = new CryptoService(secret)

  it('round-trips a simple string', () => {
    const plaintext = 'hello world'
    const encrypted = service.encrypt(plaintext)
    const decrypted = service.decrypt(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('round-trips an empty string', () => {
    const plaintext = ''
    const encrypted = service.encrypt(plaintext)
    const decrypted = service.decrypt(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('round-trips unicode content', () => {
    const plaintext = 'Ünïcödé 🔐 Schlüssel'
    const encrypted = service.encrypt(plaintext)
    const decrypted = service.decrypt(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('round-trips a long string', () => {
    const plaintext = 'a'.repeat(10_000)
    const encrypted = service.encrypt(plaintext)
    const decrypted = service.decrypt(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const plaintext = 'same-input'
    const encrypted1 = service.encrypt(plaintext)
    const encrypted2 = service.encrypt(plaintext)
    expect(encrypted1).not.toBe(encrypted2)
  })

  it('produces output in iv:authTag:ciphertext hex format', () => {
    const encrypted = service.encrypt('test')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    // IV: 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24)
    // Auth tag: 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32)
    // Ciphertext: at least 1 hex char pair
    expect(parts[2]!.length).toBeGreaterThan(0)
  })

  it('fails to decrypt with a different key', () => {
    const otherService = new CryptoService('different-secret')
    const encrypted = service.encrypt('sensitive data')
    expect(() => otherService.decrypt(encrypted)).toThrow()
  })

  it('fails to decrypt tampered ciphertext', () => {
    const encrypted = service.encrypt('test data')
    const parts = encrypted.split(':')
    // Tamper with the ciphertext portion
    const tampered = `${parts[0]}:${parts[1]}:${'ff'.repeat(parts[2]!.length / 2)}`
    expect(() => service.decrypt(tampered)).toThrow()
  })

  it('fails to decrypt invalid format (missing parts)', () => {
    expect(() => service.decrypt('onlyonepart')).toThrow('Invalid ciphertext format')
  })

  it('fails to decrypt invalid format (too many parts)', () => {
    expect(() => service.decrypt('a:b:c:d')).toThrow('Invalid ciphertext format')
  })

  it('fails to decrypt with invalid IV length', () => {
    // IV should be 12 bytes (24 hex chars), provide 8 bytes (16 hex chars)
    const shortIv = 'aabbccdd11223344'
    const fakeTag = 'aa'.repeat(16)
    const fakeData = 'bb'.repeat(4)
    expect(() => service.decrypt(`${shortIv}:${fakeTag}:${fakeData}`)).toThrow('Invalid IV length')
  })
})

// ─── encryptDocument / decryptDocument (E2E Document Encryption) ─────────────

describe('encryptDocument / decryptDocument', () => {
  const secret = 'server-secret-not-used-for-docs'
  const service = new CryptoService(secret)
  const passphrase = 'my-secure-passphrase'

  it('round-trips text content', () => {
    const content = Buffer.from('Hello, World!')
    const encrypted = service.encryptDocument(content, passphrase)
    const decrypted = service.decryptDocument(encrypted, passphrase)
    expect(decrypted.equals(content)).toBe(true)
  })

  it('round-trips empty content', () => {
    const content = Buffer.alloc(0)
    const encrypted = service.encryptDocument(content, passphrase)
    const decrypted = service.decryptDocument(encrypted, passphrase)
    expect(decrypted.equals(content)).toBe(true)
  })

  it('round-trips binary content', () => {
    const content = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x7f])
    const encrypted = service.encryptDocument(content, passphrase)
    const decrypted = service.decryptDocument(encrypted, passphrase)
    expect(decrypted.equals(content)).toBe(true)
  })

  it('round-trips large content', () => {
    const content = Buffer.alloc(100_000, 0xab)
    const encrypted = service.encryptDocument(content, passphrase)
    const decrypted = service.decryptDocument(encrypted, passphrase)
    expect(decrypted.equals(content)).toBe(true)
  })

  it('produces different ciphertexts for the same content (random salt + IV)', () => {
    const content = Buffer.from('same content')
    const encrypted1 = service.encryptDocument(content, passphrase)
    const encrypted2 = service.encryptDocument(content, passphrase)
    expect(encrypted1.equals(encrypted2)).toBe(false)
  })

  it('encrypted output is larger than input (includes salt + IV + authTag)', () => {
    const content = Buffer.from('test')
    const encrypted = service.encryptDocument(content, passphrase)
    // Overhead: 16 (salt) + 12 (IV) + 16 (authTag) = 44 bytes
    expect(encrypted.length).toBe(content.length + 44)
  })

  it('fails to decrypt with wrong passphrase', () => {
    const content = Buffer.from('secret document')
    const encrypted = service.encryptDocument(content, passphrase)
    expect(() => service.decryptDocument(encrypted, 'wrong-passphrase')).toThrow()
  })

  it('fails to decrypt tampered data', () => {
    const content = Buffer.from('important data')
    const encrypted = service.encryptDocument(content, passphrase)
    // Tamper with the last byte of ciphertext
    encrypted[encrypted.length - 1] = (encrypted[encrypted.length - 1]! ^ 0xff) as number
    expect(() => service.decryptDocument(encrypted, passphrase)).toThrow()
  })

  it('fails to decrypt buffer that is too short', () => {
    const tooShort = Buffer.alloc(10)
    expect(() => service.decryptDocument(tooShort, passphrase)).toThrow('too short')
  })

  it('is independent of the server secret (uses passphrase only)', () => {
    const service1 = new CryptoService('secret-one')
    const service2 = new CryptoService('secret-two')
    const content = Buffer.from('shared document')

    const encrypted = service1.encryptDocument(content, passphrase)
    const decrypted = service2.decryptDocument(encrypted, passphrase)
    expect(decrypted.equals(content)).toBe(true)
  })
})
