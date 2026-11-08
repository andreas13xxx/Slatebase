import { describe, expect, it } from 'vitest'
import { isPlainEmailAddress } from './email-address.js'

describe('isPlainEmailAddress', () => {
  it('accepts ordinary addresses', () => {
    for (const ok of ['alice@example.org', 'first.last+tag@sub.example.co.uk', "o'brien@example.org", 'a_b-c@ex-ample.org']) {
      expect(isPlainEmailAddress(ok), ok).toBe(true)
    }
  })

  it('rejects anything a mailer could read as more than one plain recipient', () => {
    for (const bad of [
      'a,b@example.org',
      'a@example.org,b@example.org',
      'a;b@example.org',
      '"a b"@example.org',
      'Alice <alice@example.org>',
      'alice@example.org\r\nBcc: x@example.org',
      'alice@example.org ',
      ' alice@example.org',
      '(c)alice@example.org',
      'alice@@example.org',
      'alice@localhost',
      'alice@-example.org',
      '',
    ]) {
      expect(isPlainEmailAddress(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('rejects over-long parts', () => {
    expect(isPlainEmailAddress(`${'a'.repeat(65)}@example.org`)).toBe(false)
    expect(isPlainEmailAddress(`a@${'b'.repeat(64)}.org`)).toBe(false)
    expect(isPlainEmailAddress(`a@${'b.'.repeat(130)}org`)).toBe(false)
  })
})
