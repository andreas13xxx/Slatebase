import { describe, expect, it } from 'vitest'
import { PLUGIN_LIMITS, formatPluginLimit } from './plugin-limits.js'

describe('PLUGIN_LIMITS', () => {
  it('leaves room above the largest measured community plugin (main.js 5.2 MB)', () => {
    expect(PLUGIN_LIMITS.maxFileBytes).toBeGreaterThanOrEqual(4.5 * 5.2 * 1024 * 1024)
  })

  it('keeps the limits consistent with each other', () => {
    expect(PLUGIN_LIMITS.maxExtractedBytes).toBeGreaterThanOrEqual(PLUGIN_LIMITS.maxZipBytes)
    expect(PLUGIN_LIMITS.maxTotalDownloadBytes).toBeGreaterThanOrEqual(PLUGIN_LIMITS.maxAssetBytes)
    expect(PLUGIN_LIMITS.maxZipBytes).toBeGreaterThanOrEqual(PLUGIN_LIMITS.maxFileBytes)
  })

  it('formats a limit for a message', () => {
    expect(formatPluginLimit(PLUGIN_LIMITS.maxFileBytes)).toBe('25 MB')
    expect(formatPluginLimit(1536 * 1024)).toBe('1.5 MB')
  })
})
