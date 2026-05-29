import { describe, it, expect } from 'vitest'
import { generateHeadingAnchor, createAnchorTracker } from './heading-anchor'

describe('generateHeadingAnchor', () => {
  it('converts text to lowercase', () => {
    expect(generateHeadingAnchor('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(generateHeadingAnchor('my heading text')).toBe('my-heading-text')
  })

  it('replaces multiple consecutive spaces with a single hyphen', () => {
    expect(generateHeadingAnchor('hello   world')).toBe('hello-world')
  })

  it('removes non-alphanumeric characters except hyphens and underscores', () => {
    expect(generateHeadingAnchor('Hello, World!')).toBe('hello-world')
    expect(generateHeadingAnchor('test@#$%value')).toBe('testvalue')
  })

  it('preserves hyphens and underscores', () => {
    expect(generateHeadingAnchor('my-heading_text')).toBe('my-heading_text')
  })

  it('preserves German umlauts (äöüß)', () => {
    expect(generateHeadingAnchor('Überschrift')).toBe('überschrift')
    expect(generateHeadingAnchor('Ärger mit Öl und Süße')).toBe('ärger-mit-öl-und-süße')
    expect(generateHeadingAnchor('Straße')).toBe('straße')
  })

  it('handles empty string', () => {
    expect(generateHeadingAnchor('')).toBe('')
  })

  it('handles string with only special characters', () => {
    expect(generateHeadingAnchor('!@#$%')).toBe('')
  })

  it('handles tabs and newlines as whitespace', () => {
    expect(generateHeadingAnchor('hello\tworld\nnew')).toBe('hello-world-new')
  })

  it('is deterministic (same input produces same output)', () => {
    const input = 'Meine Überschrift!'
    const result1 = generateHeadingAnchor(input)
    const result2 = generateHeadingAnchor(input)
    expect(result1).toBe(result2)
  })
})

describe('createAnchorTracker', () => {
  it('returns base anchor for first occurrence', () => {
    const tracker = createAnchorTracker()
    expect(tracker.getAnchor('Hello World')).toBe('hello-world')
  })

  it('appends -1 suffix for second occurrence of same heading', () => {
    const tracker = createAnchorTracker()
    tracker.getAnchor('Hello')
    expect(tracker.getAnchor('Hello')).toBe('hello-1')
  })

  it('appends incrementing suffixes for repeated headings', () => {
    const tracker = createAnchorTracker()
    expect(tracker.getAnchor('Test')).toBe('test')
    expect(tracker.getAnchor('Test')).toBe('test-1')
    expect(tracker.getAnchor('Test')).toBe('test-2')
    expect(tracker.getAnchor('Test')).toBe('test-3')
  })

  it('tracks different headings independently', () => {
    const tracker = createAnchorTracker()
    expect(tracker.getAnchor('Alpha')).toBe('alpha')
    expect(tracker.getAnchor('Beta')).toBe('beta')
    expect(tracker.getAnchor('Alpha')).toBe('alpha-1')
    expect(tracker.getAnchor('Beta')).toBe('beta-1')
  })

  it('treats headings that normalize to the same anchor as duplicates', () => {
    const tracker = createAnchorTracker()
    expect(tracker.getAnchor('Hello World')).toBe('hello-world')
    expect(tracker.getAnchor('Hello  World')).toBe('hello-world-1')
    expect(tracker.getAnchor('HELLO WORLD')).toBe('hello-world-2')
  })

  it('resets state correctly', () => {
    const tracker = createAnchorTracker()
    tracker.getAnchor('Test')
    tracker.getAnchor('Test')
    tracker.reset()
    expect(tracker.getAnchor('Test')).toBe('test')
  })

  it('handles umlauts in duplicate tracking', () => {
    const tracker = createAnchorTracker()
    expect(tracker.getAnchor('Überschrift')).toBe('überschrift')
    expect(tracker.getAnchor('Überschrift')).toBe('überschrift-1')
  })
})
