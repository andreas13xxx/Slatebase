import { describe, expect, it } from 'vitest'
import { updateVaultConfigSchema } from './validation.js'

describe('updateVaultConfigSchema: dailyNoteFormat', () => {
  const parse = (dailyNoteFormat: string) => updateVaultConfigSchema.safeParse({ dailyNoteFormat })

  it('accepts the patterns Obsidian users write', () => {
    for (const format of ['YYYY-MM-DD', 'YYYY/MM/YYYY-MM-DD', 'MM月/MM-DD ddd', '[Journal] YYYY-[W]ww', 'gggg-[W]WW/dddd']) {
      expect(parse(format).success, format).toBe(true)
    }
  })

  it('refuses a pattern that could leave the daily notes folder or is not a name', () => {
    for (const format of ['', '../YYYY-MM-DD', '/YYYY-MM-DD', 'YYYY\\MM', 'YYYY//MM', 'YYYY\u0000MM', 'x'.repeat(129)]) {
      expect(parse(format).success, JSON.stringify(format)).toBe(false)
    }
  })

  it('leaves the format out of a change that does not mention it', () => {
    expect(updateVaultConfigSchema.safeParse({ dailyNotesDirectory: 'Journal' })).toMatchObject({ success: true, data: { dailyNotesDirectory: 'Journal' } })
  })
})
