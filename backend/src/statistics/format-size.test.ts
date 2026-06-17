// Unit tests for formatSize utility

import { describe, it, expect } from 'vitest'
import { formatSize } from './format-size.js'

describe('formatSize', () => {
  it('formats 0 bytes', () => {
    expect(formatSize(0)).toBe('0 Bytes')
  })

  it('formats values under 1024 as Bytes', () => {
    expect(formatSize(1)).toBe('1 Bytes')
    expect(formatSize(512)).toBe('512 Bytes')
    expect(formatSize(1023)).toBe('1023 Bytes')
  })

  it('formats exactly 1024 as KB', () => {
    expect(formatSize(1024)).toBe('1 KB')
  })

  it('formats KB values with decimals stripped of trailing zeros', () => {
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(1048575)).toBe('1024 KB')
  })

  it('formats exactly 1048576 as MB', () => {
    expect(formatSize(1_048_576)).toBe('1 MB')
  })

  it('formats MB values with max 2 decimal places', () => {
    expect(formatSize(1_572_864)).toBe('1.5 MB')
    expect(formatSize(10_485_760)).toBe('10 MB')
    expect(formatSize(1_073_741_823)).toBe('1024 MB')
  })

  it('formats exactly 1073741824 as GB', () => {
    expect(formatSize(1_073_741_824)).toBe('1 GB')
  })

  it('formats GB values with max 2 decimal places', () => {
    expect(formatSize(1_610_612_736)).toBe('1.5 GB')
    expect(formatSize(10_737_418_240)).toBe('10 GB')
  })

  it('strips trailing zeros after decimal', () => {
    // 1.50 KB → "1.5 KB"
    expect(formatSize(1536)).toBe('1.5 KB')
    // Exact KB → no decimals
    expect(formatSize(5120)).toBe('5 KB')
  })

  it('keeps up to 2 meaningful decimal places', () => {
    // 1025 bytes = 1.0009... KB → "1 KB" (rounds to 1.00, stripped)
    expect(formatSize(1025)).toBe('1 KB')
    // 1075 bytes = 1.0498... KB → "1.05 KB"
    expect(formatSize(1075)).toBe('1.05 KB')
  })
})
