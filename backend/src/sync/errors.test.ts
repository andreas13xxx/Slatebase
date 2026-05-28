import { describe, it, expect } from 'vitest'
import {
  SyncNotConfiguredError,
  SyncAlreadyConfiguredError,
  SyncInProgressError,
  ConnectionTestFailedError,
  InvalidSetupUriError,
  InvalidSyncIntervalError,
  InvalidPassphraseError,
  ConflictResolutionError,
} from './errors.js'

describe('Sync Error Classes', () => {
  it('SyncNotConfiguredError has correct defaults', () => {
    const error = new SyncNotConfiguredError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SyncNotConfiguredError')
    expect(error.code).toBe('SYNC_NOT_CONFIGURED')
    expect(error.message).toBe('Sync is not configured for this vault')
  })

  it('SyncNotConfiguredError accepts custom message', () => {
    const error = new SyncNotConfiguredError('Custom message')
    expect(error.message).toBe('Custom message')
    expect(error.code).toBe('SYNC_NOT_CONFIGURED')
  })

  it('SyncAlreadyConfiguredError has correct defaults', () => {
    const error = new SyncAlreadyConfiguredError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SyncAlreadyConfiguredError')
    expect(error.code).toBe('SYNC_ALREADY_CONFIGURED')
    expect(error.message).toBe('Sync is already configured for this vault')
  })

  it('SyncInProgressError has correct defaults', () => {
    const error = new SyncInProgressError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SyncInProgressError')
    expect(error.code).toBe('SYNC_IN_PROGRESS')
    expect(error.message).toBe('A sync operation is already in progress for this vault')
  })

  it('ConnectionTestFailedError has correct defaults', () => {
    const error = new ConnectionTestFailedError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ConnectionTestFailedError')
    expect(error.code).toBe('CONNECTION_TEST_FAILED')
    expect(error.message).toBe('Connection test to the CouchDB instance failed')
  })

  it('InvalidSetupUriError has correct defaults', () => {
    const error = new InvalidSetupUriError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('InvalidSetupUriError')
    expect(error.code).toBe('INVALID_SETUP_URI')
    expect(error.message).toBe('The provided setup URI is invalid')
  })

  it('InvalidSyncIntervalError has correct defaults', () => {
    const error = new InvalidSyncIntervalError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('InvalidSyncIntervalError')
    expect(error.code).toBe('INVALID_SYNC_INTERVAL')
    expect(error.message).toBe('Sync interval must be between 5 and 1440 minutes')
  })

  it('InvalidPassphraseError has correct defaults', () => {
    const error = new InvalidPassphraseError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('InvalidPassphraseError')
    expect(error.code).toBe('INVALID_PASSPHRASE')
    expect(error.message).toBe('Passphrase must be between 8 and 256 characters')
  })

  it('ConflictResolutionError has correct defaults', () => {
    const error = new ConflictResolutionError()
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ConflictResolutionError')
    expect(error.code).toBe('CONFLICT_RESOLUTION_ERROR')
    expect(error.message).toBe('Conflict resolution failed')
  })

  it('all errors accept custom messages', () => {
    const errors = [
      new SyncNotConfiguredError('custom'),
      new SyncAlreadyConfiguredError('custom'),
      new SyncInProgressError('custom'),
      new ConnectionTestFailedError('custom'),
      new InvalidSetupUriError('custom'),
      new InvalidSyncIntervalError('custom'),
      new InvalidPassphraseError('custom'),
      new ConflictResolutionError('custom'),
    ]

    for (const error of errors) {
      expect(error.message).toBe('custom')
    }
  })
})
