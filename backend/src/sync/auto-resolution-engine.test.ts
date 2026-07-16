import { describe, it, expect } from 'vitest'
import { AutoResolutionEngine } from './auto-resolution-engine.js'
import type { CategorizedConflictEntry, AutoResolutionConfig } from './types.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createConflict(overrides?: Partial<CategorizedConflictEntry>): CategorizedConflictEntry {
  return {
    documentPath: 'notes/test.md',
    category: 'content_conflict',
    local: {
      modifiedAt: '2024-06-01T12:00:00.000Z',
      size: 100,
    },
    remote: {
      revision: '2-abc',
      modifiedAt: '2024-06-01T10:00:00.000Z',
      size: 120,
    },
    detectedAt: '2024-06-01T12:05:00.000Z',
    ...overrides,
  }
}

function createConfig(overrides?: Partial<AutoResolutionConfig>): AutoResolutionConfig {
  return {
    enabled: true,
    strategies: {
      content_conflict: 'newer_wins',
    },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AutoResolutionEngine', () => {
  const engine = new AutoResolutionEngine()

  describe('evaluate() — disabled config', () => {
    it('returns null when config.enabled is false', () => {
      const conflict = createConflict()
      const config = createConfig({ enabled: false })

      const result = engine.evaluate(conflict, config)

      expect(result).toBeNull()
    })
  })

  describe('evaluate() — no strategy configured', () => {
    it('returns null when no strategy is configured for the conflict category', () => {
      const conflict = createConflict({ category: 'local_deleted' })
      const config = createConfig({ enabled: true, strategies: {} })

      const result = engine.evaluate(conflict, config)

      expect(result).toBeNull()
    })

    it('returns null for unconfigured category even when other categories have strategies', () => {
      const conflict = createConflict({ category: 'rename_conflict' })
      const config = createConfig({
        enabled: true,
        strategies: { content_conflict: 'newer_wins', local_deleted: 'remote_wins' },
      })

      const result = engine.evaluate(conflict, config)

      expect(result).toBeNull()
    })
  })

  describe('evaluate() — newer_wins strategy', () => {
    it('returns use_local when local mtime is later than remote', () => {
      const conflict = createConflict({
        local: { modifiedAt: '2024-06-01T14:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-06-01T10:00:00.000Z', size: 120 },
      })
      const config = createConfig({ strategies: { content_conflict: 'newer_wins' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'use_local' })
    })

    it('returns use_remote when remote mtime is later than local', () => {
      const conflict = createConflict({
        local: { modifiedAt: '2024-06-01T08:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-06-01T14:00:00.000Z', size: 120 },
      })
      const config = createConfig({ strategies: { content_conflict: 'newer_wins' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'use_remote' })
    })

    it('returns use_remote (fallback) when timestamps are identical', () => {
      const sameTime = '2024-06-01T12:00:00.000Z'
      const conflict = createConflict({
        local: { modifiedAt: sameTime, size: 100 },
        remote: { revision: '2-abc', modifiedAt: sameTime, size: 120 },
      })
      const config = createConfig({ strategies: { content_conflict: 'newer_wins' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'use_remote' })
    })

    it('handles millisecond-level differences correctly', () => {
      const conflict = createConflict({
        local: { modifiedAt: '2024-06-01T12:00:00.001Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-06-01T12:00:00.000Z', size: 120 },
      })
      const config = createConfig({ strategies: { content_conflict: 'newer_wins' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'use_local' })
    })
  })

  describe('evaluate() — remote_wins strategy', () => {
    it('always returns use_remote regardless of timestamps', () => {
      const conflict = createConflict({
        category: 'local_deleted',
        local: { modifiedAt: '2024-06-01T20:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-06-01T01:00:00.000Z', size: 120 },
      })
      const config = createConfig({ strategies: { local_deleted: 'remote_wins' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'use_remote' })
    })
  })

  describe('evaluate() — local_wins strategy', () => {
    it('always returns use_local regardless of timestamps', () => {
      const conflict = createConflict({
        category: 'remote_deleted',
        local: { modifiedAt: '2024-06-01T01:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-06-01T20:00:00.000Z', size: 120 },
      })
      const config = createConfig({ strategies: { remote_deleted: 'local_wins' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'use_local' })
    })
  })

  describe('evaluate() — skip strategy', () => {
    it('always returns skip', () => {
      const conflict = createConflict({ category: 'rename_conflict' })
      const config = createConfig({ strategies: { rename_conflict: 'skip' } })

      const result = engine.evaluate(conflict, config)

      expect(result).toEqual({ type: 'skip' })
    })
  })

  describe('evaluate() — multiple strategies configured', () => {
    it('uses the correct strategy for each category', () => {
      const config: AutoResolutionConfig = {
        enabled: true,
        strategies: {
          content_conflict: 'newer_wins',
          local_deleted: 'remote_wins',
          remote_deleted: 'local_wins',
          rename_conflict: 'skip',
        },
      }

      const contentConflict = createConflict({
        category: 'content_conflict',
        local: { modifiedAt: '2024-06-01T14:00:00.000Z', size: 100 },
        remote: { revision: '2-abc', modifiedAt: '2024-06-01T10:00:00.000Z', size: 120 },
      })
      expect(engine.evaluate(contentConflict, config)).toEqual({ type: 'use_local' })

      const localDeleted = createConflict({ category: 'local_deleted' })
      expect(engine.evaluate(localDeleted, config)).toEqual({ type: 'use_remote' })

      const remoteDeleted = createConflict({ category: 'remote_deleted' })
      expect(engine.evaluate(remoteDeleted, config)).toEqual({ type: 'use_local' })

      const renameConflict = createConflict({ category: 'rename_conflict' })
      expect(engine.evaluate(renameConflict, config)).toEqual({ type: 'skip' })
    })
  })
})
