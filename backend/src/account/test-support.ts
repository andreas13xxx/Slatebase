// Shared test helpers for the account module: an in-memory user repository,
// a silent logger and a software WebAuthn authenticator (ES256, "none" attestation).

import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'
import type { ILogger } from '../logger/index.js'
import type { IUserRepository, PaginatedResult, UserRecord, UserRole } from '../user/index.js'

export function silentLogger(): ILogger {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
}

export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    userId: 'user-1',
    username: 'alice',
    passwordHash: 'unused',
    role: 'user' as UserRole,
    displayName: 'Alice',
    email: '',
    avatarUrl: '',
    avatarType: 'initials',
    avatarColor: '',
    avatarData: '',
    avatarDicebear: '',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export class InMemoryUserRepository implements IUserRepository {
  readonly users = new Map<string, UserRecord>()

  constructor(users: UserRecord[] = []) {
    for (const u of users) this.users.set(u.userId, u)
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const u = this.users.get(userId)
    return u === undefined ? null : structuredClone(u)
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === username.toLowerCase()) return structuredClone(u)
    }
    return null
  }

  async searchByUsernamePrefix(): Promise<UserRecord[]> {
    return []
  }

  async findAll(options?: { page: number; pageSize: number }): Promise<PaginatedResult<UserRecord>> {
    const all = [...this.users.values()].sort((a, b) => a.username.localeCompare(b.username))
    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 100
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize).map((u) => structuredClone(u)),
      total: all.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
    }
  }

  async save(user: UserRecord): Promise<void> {
    this.users.set(user.userId, structuredClone(user))
  }

  async delete(userId: string): Promise<void> {
    this.users.delete(userId)
  }

  async count(): Promise<number> {
    return this.users.size
  }

  async countByRole(role: UserRole): Promise<number> {
    return [...this.users.values()].filter((u) => u.role === role).length
  }
}

const sha256 = (data: Uint8Array): Buffer => createHash('sha256').update(data).digest()
const b64u = (data: Uint8Array): string => isoBase64URL.fromBuffer(new Uint8Array(data))

/** A minimal software authenticator: ES256 key, "none" attestation, configurable counter. */
export class SoftAuthenticator {
  readonly credentialId = randomBytes(32)
  counter = 0
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })

  get id(): string {
    return b64u(this.credentialId)
  }

  private coseKey(): Uint8Array {
    const jwk = this.keys.publicKey.export({ format: 'jwk' })
    const x = Buffer.from(jwk.x ?? '', 'base64url')
    const y = Buffer.from(jwk.y ?? '', 'base64url')
    return isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]))
  }

  private clientData(type: string, challenge: string, origin: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  }

  register(options: { challenge: string }, rpId: string, origin: string): RegistrationResponseJSON {
    const credId = this.credentialId
    const idLen = Buffer.alloc(2)
    idLen.writeUInt16BE(credId.length)
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(this.counter)
    const authData = Buffer.concat([sha256(Buffer.from(rpId)), Buffer.from([0x45]), counter, Buffer.alloc(16), idLen, credId, this.coseKey()])
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as never)
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64u(this.clientData('webauthn.create', options.challenge, origin)),
        attestationObject: b64u(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
    }
  }

  authenticate(options: { challenge: string }, rpId: string, origin: string, userHandle: string): AuthenticationResponseJSON {
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(this.counter)
    const authData = Buffer.concat([sha256(Buffer.from(rpId)), Buffer.from([0x05]), counter])
    const clientData = this.clientData('webauthn.get', options.challenge, origin)
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), this.keys.privateKey)
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64u(clientData),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: b64u(Buffer.from(userHandle)),
      },
      clientExtensionResults: {},
    }
  }
}
