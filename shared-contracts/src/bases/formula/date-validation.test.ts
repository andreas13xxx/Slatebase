import { describe, expect, it } from 'vitest'
import { toDate } from './functions.js'
import { formatFormulaValue } from './evaluator.js'

describe('toDate — bare YYYY-MM-DD', () => {
  it('parses a valid date as local midnight', () => {
    const d = toDate('2024-02-29')
    expect(d).not.toBeNull()
    expect([d!.getFullYear(), d!.getMonth(), d!.getDate()]).toEqual([2024, 1, 29])
  })

  it('rejects dates that would roll over into the next month', () => {
    expect(toDate('2024-02-31')).toBeNull()
    expect(toDate('2023-02-29')).toBeNull()
    expect(toDate('2024-04-31')).toBeNull()
    expect(toDate('2024-13-01')).toBeNull()
    expect(toDate('2024-00-10')).toBeNull()
  })

  it('keeps years below 100 as written instead of mapping them to 19xx', () => {
    const d = toDate('0050-01-01')
    expect(d?.getFullYear()).toBe(50)
  })
})

describe('formatFormulaValue — invalid Date', () => {
  it('renders an empty cell instead of throwing', () => {
    expect(formatFormulaValue(new Date(NaN))).toBe('')
  })

  it('still renders a valid bare date as Y-M-D', () => {
    expect(formatFormulaValue(new Date(2024, 0, 5))).toBe('2024-01-05')
  })
})
