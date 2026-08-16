import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from './fuzzyMatch'

describe('fuzzyMatch', () => {
  it('returns 0 for an empty query', () => {
    expect(fuzzyMatch('', 'anything.md')).toBe(0)
  })

  it('matches a subsequence case-insensitively', () => {
    expect(fuzzyMatch('nte', 'Notes/Meeting.md')).not.toBeNull()
    expect(fuzzyMatch('NTE', 'notes/meeting.md')).not.toBeNull()
  })

  it('returns null when characters are out of order', () => {
    expect(fuzzyMatch('zyx', 'xyz.md')).toBeNull()
  })

  it('returns null when a character is missing entirely', () => {
    expect(fuzzyMatch('abcq', 'abc.md')).toBeNull()
  })

  it('scores consecutive matches better than scattered ones', () => {
    const consecutive = fuzzyMatch('meet', 'meeting.md')!
    const scattered = fuzzyMatch('meet', 'my-elaborate-event-tracker.md')!
    expect(consecutive).toBeLessThan(scattered)
  })

  it('scores an earlier match position better, all else equal', () => {
    const early = fuzzyMatch('log', 'log-early.md')!
    const late = fuzzyMatch('log', 'xxxxxxxxxxlog.md')!
    expect(early).toBeLessThan(late)
  })
})
