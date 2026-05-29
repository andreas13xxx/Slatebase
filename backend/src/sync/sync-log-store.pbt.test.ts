/**
 * Property-Based Tests for SyncLogStore
 *
 * Property 12: Log Pagination Consistency
 * Property 13: Log Rotation Cap
 *
 * **Validates: Requirements 5.4, 5.7**
 */
import { describe, it, expect, afterAll } from 'vitest'
import * as fc from 'fast-check'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { SyncLogStore } from './sync-log-store.js'
import type { ILogger } from '../logger/index.js'
import type { SyncLogEntry } from './types.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
}

// ─── Test Setup ──────────────────────────────────────────────────────────────

const tempDirs: string[] = []

async function createTempStore(): Promise<{ store: SyncLogStore; tempDir: string }> {
  const tempDir = path.join(os.tmpdir(), `slatebase-synclog-pbt-${crypto.randomBytes(8).toString('hex')}`)
  await mkdir(tempDir, { recursive: true })
  tempDirs.push(tempDir)
  const logger = createMockLogger()
  const store = new SyncLogStore(tempDir, logger)
  return { store, tempDir }
}

afterAll(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

// ─── Property 12: Log Pagination Consistency ─────────────────────────────────
// For any sync log with N total entries queried with page P and pageSize S,
// the response SHALL satisfy:
// - totalPages = ceil(N / S)
// - items.length <= S
// - items.length = min(S, N - (P-1)*S) for valid pages
// - total = N
// **Validates: Requirements 5.4**

describe('Property 12: Log Pagination Consistency', () => {
  it('pagination math is consistent for any N entries, page P, and pageSize S', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),   // N: number of entries (small for speed)
        fc.integer({ min: 1, max: 50 }),   // pageSize (S)
        fc.integer({ min: 1, max: 10 }),   // page (P)
        async (n, pageSize, page) => {
          const { store } = await createTempStore()
          const vaultId = `vault-${crypto.randomBytes(6).toString('hex')}`

          // Append N entries with unique timestamps
          for (let i = 0; i < n; i++) {
            const entry: SyncLogEntry = {
              id: `e-${i}`,
              timestamp: new Date(1700000000000 + i * 1000).toISOString(),
              triggerType: 'manual',
              mode: 'bidirectional',
              status: 'success',
            }
            await store.append(vaultId, entry)
          }

          // Query with page P and pageSize S
          const result = await store.read(vaultId, page, pageSize)

          // The effective pageSize is capped at 100
          const effectivePageSize = Math.min(pageSize, 100)

          // total = N
          expect(result.total).toBe(n)

          // totalPages = ceil(N / S)
          const expectedTotalPages = Math.ceil(n / effectivePageSize)
          expect(result.totalPages).toBe(expectedTotalPages)

          // items.length <= S
          expect(result.items.length).toBeLessThanOrEqual(effectivePageSize)

          // For valid pages (page <= totalPages): items.length = min(S, N - (P-1)*S)
          if (page <= expectedTotalPages) {
            const expectedItemCount = Math.min(effectivePageSize, n - (page - 1) * effectivePageSize)
            expect(result.items.length).toBe(expectedItemCount)
          } else {
            // Beyond last page: no items
            expect(result.items.length).toBe(0)
          }

          // pageSize in response reflects effective value
          expect(result.pageSize).toBe(effectivePageSize)
          expect(result.page).toBe(page)
        },
      ),
      { numRuns: 10 },
    )
  }, 30_000)
})

// ─── Property 13: Log Rotation Cap ──────────────────────────────────────────
// After any write, total entries SHALL never exceed 1000.
// **Validates: Requirements 5.7**

describe('Property 13: Log Rotation Cap', () => {
  it('after exceeding 1000 entries, total is capped at 1000', async () => {
    const { store } = await createTempStore()
    const vaultId = `vault-${crypto.randomBytes(6).toString('hex')}`

    // Write a JSONL file directly with 999 entries to skip the slow append loop
    const syncDir = path.join(tempDirs[tempDirs.length - 1]!, 'sync', vaultId)
    await mkdir(syncDir, { recursive: true })
    const filePath = path.join(syncDir, 'sync-log.jsonl')

    // Build 999 entries as JSONL content
    const lines: string[] = []
    for (let i = 0; i < 999; i++) {
      const entry: SyncLogEntry = {
        id: `e-${i}`,
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        triggerType: 'manual',
        mode: 'bidirectional',
        status: 'success',
      }
      lines.push(JSON.stringify(entry))
    }
    const { writeFile: wf } = await import('node:fs/promises')
    await wf(filePath, lines.join('\n') + '\n', 'utf-8')

    // Verify we have 999
    let result = await store.read(vaultId, 1, 100)
    expect(result.total).toBe(999)

    // Append 2 more via the store (total would be 1001 without rotation)
    for (let i = 999; i < 1001; i++) {
      const entry: SyncLogEntry = {
        id: `e-${i}`,
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        triggerType: 'manual',
        mode: 'bidirectional',
        status: 'success',
      }
      await store.append(vaultId, entry)
    }

    // total SHALL be capped at 1000
    result = await store.read(vaultId, 1, 100)
    expect(result.total).toBeLessThanOrEqual(1000)
    expect(result.total).toBe(1000)
  }, 30_000)
})
