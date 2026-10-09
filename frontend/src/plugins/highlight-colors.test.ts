import { describe, it, expect } from 'vitest'
import { HIGHLIGHT_COLORS, matchHighlightColor } from './highlight-colors'

describe('matchHighlightColor', () => {
  it('defaults to yellow with no marker when there is no leading emoji', () => {
    expect(matchHighlightColor('plain text')).toEqual({ color: 'yellow', markerLength: 0 })
  })

  it('resolves each color emoji', () => {
    expect(matchHighlightColor('🔴 danger').color).toBe('red')
    expect(matchHighlightColor('🟠 warn').color).toBe('orange')
    expect(matchHighlightColor('🟢 ok').color).toBe('green')
    expect(matchHighlightColor('🔵 info').color).toBe('blue')
    expect(matchHighlightColor('🟣 note').color).toBe('purple')
  })

  it('counts the emoji plus a single following space as the marker', () => {
    const m = matchHighlightColor('🔴 text')
    // 🔴 is two UTF-16 code units + one space
    expect(m.markerLength).toBe(3)
  })

  it('counts only the emoji when no space follows', () => {
    expect(matchHighlightColor('🔴text').markerLength).toBe(2)
  })

  it('treats a non-color emoji as plain yellow', () => {
    expect(matchHighlightColor('😀 smile')).toEqual({ color: 'yellow', markerLength: 0 })
  })

  it('handles empty input', () => {
    expect(matchHighlightColor('')).toEqual({ color: 'yellow', markerLength: 0 })
  })

  it('exposes a yellow default color with no emoji in the palette', () => {
    const yellow = HIGHLIGHT_COLORS.find((c) => c.name === 'yellow')
    expect(yellow?.emoji).toBeNull()
    expect(HIGHLIGHT_COLORS.filter((c) => c.emoji !== null)).toHaveLength(5)
  })
})
