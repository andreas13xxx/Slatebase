import { describe, it, expect } from 'vitest'
import { nextPropertiesInDocument } from './propertiesInDocument'

describe('nextPropertiesInDocument', () => {
  it('hides visible properties', () => {
    expect(nextPropertiesInDocument('visible')).toBe('hidden')
  })
  it('makes hidden and raw-YAML properties visible again', () => {
    expect(nextPropertiesInDocument('hidden')).toBe('visible')
    expect(nextPropertiesInDocument('source')).toBe('visible')
  })
})
