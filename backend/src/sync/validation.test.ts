import { describe, it, expect } from 'vitest'
import {
  vaultIdSchema,
  endpointUrlSchema,
  databaseNameSchema,
  syncUsernameSchema,
  syncPasswordSchema,
  syncModeSchema,
  syncIntervalSchema,
  e2ePassphraseSchema,
  setupUriSchema,
  createSyncConfigSchema,
  updateSyncConfigSchema,
  triggerSyncSchema,
  resolveConflictSchema,
  syncLogQuerySchema,
} from './validation.js'

// ─── Vault-ID Schema ─────────────────────────────────────────────────────────

describe('vaultIdSchema', () => {
  it('accepts valid 12-char hex string', () => {
    expect(vaultIdSchema.safeParse('abcdef012345').success).toBe(true)
    expect(vaultIdSchema.safeParse('000000000000').success).toBe(true)
    expect(vaultIdSchema.safeParse('aabbccddeeff').success).toBe(true)
  })

  it('rejects strings with uppercase hex chars', () => {
    expect(vaultIdSchema.safeParse('ABCDEF012345').success).toBe(false)
  })

  it('rejects strings shorter than 12 chars', () => {
    expect(vaultIdSchema.safeParse('abcdef01234').success).toBe(false)
  })

  it('rejects strings longer than 12 chars', () => {
    expect(vaultIdSchema.safeParse('abcdef0123456').success).toBe(false)
  })

  it('rejects strings with non-hex chars', () => {
    expect(vaultIdSchema.safeParse('abcdefghijkl').success).toBe(false)
  })
})

// ─── Endpoint-URL Schema ─────────────────────────────────────────────────────

describe('endpointUrlSchema', () => {
  it('accepts valid http URL', () => {
    expect(endpointUrlSchema.safeParse('http://localhost:5984').success).toBe(true)
  })

  it('accepts valid https URL', () => {
    expect(endpointUrlSchema.safeParse('https://couch.example.com').success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = endpointUrlSchema.safeParse('  https://example.com  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('https://example.com')
    }
  })

  it('rejects empty string', () => {
    expect(endpointUrlSchema.safeParse('').success).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(endpointUrlSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects ftp protocol', () => {
    expect(endpointUrlSchema.safeParse('ftp://example.com').success).toBe(false)
  })

  it('rejects URL exceeding 2048 chars', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2048)
    expect(endpointUrlSchema.safeParse(longUrl).success).toBe(false)
  })

  it('rejects invalid URL format', () => {
    expect(endpointUrlSchema.safeParse('http://').success).toBe(false)
  })
})

// ─── Database Name Schema ────────────────────────────────────────────────────

describe('databaseNameSchema', () => {
  it('accepts valid CouchDB database names', () => {
    expect(databaseNameSchema.safeParse('mydb').success).toBe(true)
    expect(databaseNameSchema.safeParse('my_db').success).toBe(true)
    expect(databaseNameSchema.safeParse('my$db').success).toBe(true)
    expect(databaseNameSchema.safeParse('a123').success).toBe(true)
    expect(databaseNameSchema.safeParse('db-name').success).toBe(true)
    expect(databaseNameSchema.safeParse('db/sub').success).toBe(true)
    expect(databaseNameSchema.safeParse('db(1)').success).toBe(true)
    expect(databaseNameSchema.safeParse('db+name').success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = databaseNameSchema.safeParse('  mydb  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('mydb')
    }
  })

  it('rejects names starting with uppercase', () => {
    expect(databaseNameSchema.safeParse('Mydb').success).toBe(false)
  })

  it('rejects names starting with a number', () => {
    expect(databaseNameSchema.safeParse('1db').success).toBe(false)
  })

  it('rejects names starting with underscore', () => {
    expect(databaseNameSchema.safeParse('_mydb').success).toBe(false)
  })

  it('rejects empty string', () => {
    expect(databaseNameSchema.safeParse('').success).toBe(false)
  })

  it('rejects names with invalid characters', () => {
    expect(databaseNameSchema.safeParse('my db').success).toBe(false)
    expect(databaseNameSchema.safeParse('my@db').success).toBe(false)
    expect(databaseNameSchema.safeParse('my#db').success).toBe(false)
  })

  it('rejects names exceeding 256 chars', () => {
    const longName = 'a' + 'b'.repeat(256)
    expect(databaseNameSchema.safeParse(longName).success).toBe(false)
  })
})

// ─── Sync Username Schema ────────────────────────────────────────────────────

describe('syncUsernameSchema', () => {
  it('accepts valid non-empty username', () => {
    expect(syncUsernameSchema.safeParse('admin').success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = syncUsernameSchema.safeParse('  admin  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('admin')
    }
  })

  it('rejects empty string', () => {
    expect(syncUsernameSchema.safeParse('').success).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(syncUsernameSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects strings exceeding 256 chars', () => {
    expect(syncUsernameSchema.safeParse('a'.repeat(257)).success).toBe(false)
  })
})

// ─── Sync Password Schema ────────────────────────────────────────────────────

describe('syncPasswordSchema', () => {
  it('accepts valid non-empty password', () => {
    expect(syncPasswordSchema.safeParse('secret123').success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = syncPasswordSchema.safeParse('  pass  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('pass')
    }
  })

  it('rejects empty string', () => {
    expect(syncPasswordSchema.safeParse('').success).toBe(false)
  })

  it('rejects whitespace-only string', () => {
    expect(syncPasswordSchema.safeParse('   ').success).toBe(false)
  })

  it('rejects strings exceeding 1024 chars', () => {
    expect(syncPasswordSchema.safeParse('a'.repeat(1025)).success).toBe(false)
  })
})

// ─── Sync Mode Schema ────────────────────────────────────────────────────────

describe('syncModeSchema', () => {
  it('accepts bidirectional', () => {
    expect(syncModeSchema.safeParse('bidirectional').success).toBe(true)
  })

  it('accepts readonly', () => {
    expect(syncModeSchema.safeParse('readonly').success).toBe(true)
  })

  it('rejects invalid mode', () => {
    expect(syncModeSchema.safeParse('push-only').success).toBe(false)
  })
})

// ─── Sync Interval Schema ────────────────────────────────────────────────────

describe('syncIntervalSchema', () => {
  it('accepts 5 (minimum)', () => {
    expect(syncIntervalSchema.safeParse(5).success).toBe(true)
  })

  it('accepts 1440 (maximum)', () => {
    expect(syncIntervalSchema.safeParse(1440).success).toBe(true)
  })

  it('accepts value in range', () => {
    expect(syncIntervalSchema.safeParse(60).success).toBe(true)
  })

  it('rejects value below 5', () => {
    expect(syncIntervalSchema.safeParse(4).success).toBe(false)
  })

  it('rejects value above 1440', () => {
    expect(syncIntervalSchema.safeParse(1441).success).toBe(false)
  })

  it('rejects non-integer', () => {
    expect(syncIntervalSchema.safeParse(5.5).success).toBe(false)
  })
})

// ─── E2E Passphrase Schema ───────────────────────────────────────────────────

describe('e2ePassphraseSchema', () => {
  it('accepts 8-char passphrase', () => {
    expect(e2ePassphraseSchema.safeParse('12345678').success).toBe(true)
  })

  it('accepts 256-char passphrase', () => {
    expect(e2ePassphraseSchema.safeParse('a'.repeat(256)).success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = e2ePassphraseSchema.safeParse('  mypassphrase  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('mypassphrase')
    }
  })

  it('rejects passphrase shorter than 8 chars', () => {
    expect(e2ePassphraseSchema.safeParse('1234567').success).toBe(false)
  })

  it('rejects passphrase longer than 256 chars', () => {
    expect(e2ePassphraseSchema.safeParse('a'.repeat(257)).success).toBe(false)
  })
})

// ─── Setup-URI Schema ────────────────────────────────────────────────────────

describe('setupUriSchema', () => {
  it('accepts valid URI string', () => {
    expect(setupUriSchema.safeParse('c2V0dXA6Ly9leGFtcGxl').success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = setupUriSchema.safeParse('  someuri  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('someuri')
    }
  })

  it('rejects empty string', () => {
    expect(setupUriSchema.safeParse('').success).toBe(false)
  })

  it('rejects string exceeding 4096 chars', () => {
    expect(setupUriSchema.safeParse('a'.repeat(4097)).success).toBe(false)
  })
})

// ─── Create Sync Config Schema ───────────────────────────────────────────────

describe('createSyncConfigSchema', () => {
  it('accepts valid manual config', () => {
    const result = createSyncConfigSchema.safeParse({
      endpoint: 'https://couch.example.com',
      database: 'mydb',
      username: 'admin',
      password: 'secret',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid setupUri config', () => {
    const result = createSyncConfigSchema.safeParse({
      setupUri: 'c2V0dXA6Ly9leGFtcGxl',
      setupUriPassphrase: 'mypassphrase',
    })
    expect(result.success).toBe(true)
  })

  it('accepts manual config with optional fields', () => {
    const result = createSyncConfigSchema.safeParse({
      endpoint: 'https://couch.example.com',
      database: 'mydb',
      username: 'admin',
      password: 'secret',
      mode: 'readonly',
      trigger: 'interval',
      intervalMinutes: 30,
      e2eEnabled: true,
      e2ePassphrase: 'longpassphrase',
    })
    expect(result.success).toBe(true)
  })

  it('rejects when neither setupUri nor manual config provided', () => {
    const result = createSyncConfigSchema.safeParse({
      mode: 'bidirectional',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when both setupUri and manual config provided', () => {
    const result = createSyncConfigSchema.safeParse({
      setupUri: 'c2V0dXA6Ly9leGFtcGxl',
      endpoint: 'https://couch.example.com',
      database: 'mydb',
      username: 'admin',
      password: 'secret',
    })
    expect(result.success).toBe(false)
  })

  it('rejects incomplete manual config (missing password)', () => {
    const result = createSyncConfigSchema.safeParse({
      endpoint: 'https://couch.example.com',
      database: 'mydb',
      username: 'admin',
    })
    expect(result.success).toBe(false)
  })
})

// ─── Update Sync Config Schema ───────────────────────────────────────────────

describe('updateSyncConfigSchema', () => {
  it('accepts partial update with single field', () => {
    const result = updateSyncConfigSchema.safeParse({
      mode: 'readonly',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (no changes)', () => {
    const result = updateSyncConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts multiple fields', () => {
    const result = updateSyncConfigSchema.safeParse({
      endpoint: 'https://new.example.com',
      password: 'newpassword',
      intervalMinutes: 60,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid endpoint', () => {
    const result = updateSyncConfigSchema.safeParse({
      endpoint: 'ftp://invalid.com',
    })
    expect(result.success).toBe(false)
  })
})

// ─── Trigger Sync Schema ─────────────────────────────────────────────────────

describe('triggerSyncSchema', () => {
  it('accepts empty object', () => {
    const result = triggerSyncSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts object with extra fields (passthrough)', () => {
    const result = triggerSyncSchema.safeParse({ force: true })
    expect(result.success).toBe(true)
  })
})

// ─── Resolve Conflict Schema ─────────────────────────────────────────────────

describe('resolveConflictSchema', () => {
  it('accepts valid resolution with use_remote', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: 'notes/hello.md',
      resolution: 'use_remote',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid resolution with use_local', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: 'folder/file.md',
      resolution: 'use_local',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid resolution with skip', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: 'file.md',
      resolution: 'skip',
    })
    expect(result.success).toBe(true)
  })

  it('trims documentPath whitespace', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: '  notes/hello.md  ',
      resolution: 'use_remote',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.documentPath).toBe('notes/hello.md')
    }
  })

  it('rejects empty documentPath', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: '',
      resolution: 'use_remote',
    })
    expect(result.success).toBe(false)
  })

  it('rejects whitespace-only documentPath', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: '   ',
      resolution: 'use_remote',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid resolution value', () => {
    const result = resolveConflictSchema.safeParse({
      documentPath: 'file.md',
      resolution: 'merge',
    })
    expect(result.success).toBe(false)
  })
})

// ─── Sync Log Query Schema ───────────────────────────────────────────────────

describe('syncLogQuerySchema', () => {
  it('accepts valid page and pageSize', () => {
    const result = syncLogQuerySchema.safeParse({ page: 2, pageSize: 25 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(2)
      expect(result.data.pageSize).toBe(25)
    }
  })

  it('applies defaults when fields are missing', () => {
    const result = syncLogQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(50)
    }
  })

  it('coerces string values to numbers', () => {
    const result = syncLogQuerySchema.safeParse({ page: '3', pageSize: '20' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
      expect(result.data.pageSize).toBe(20)
    }
  })

  it('rejects page less than 1', () => {
    const result = syncLogQuerySchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects pageSize greater than 100', () => {
    const result = syncLogQuerySchema.safeParse({ pageSize: 101 })
    expect(result.success).toBe(false)
  })

  it('rejects pageSize less than 1', () => {
    const result = syncLogQuerySchema.safeParse({ pageSize: 0 })
    expect(result.success).toBe(false)
  })
})
