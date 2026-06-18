import { describe, it, expect } from 'vitest'
import { extractProperties } from './property-extractor.js'

describe('extractProperties', () => {
  it('extracts a simple string property', () => {
    const content = `---
status: aktiv
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ status: ['aktiv'] })
  })

  it('extracts a numeric property as string', () => {
    const content = `---
priority: 3
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ priority: ['3'] })
  })

  it('extracts an inline array property', () => {
    const content = `---
tags: [a, b, c]
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ tags: ['a', 'b', 'c'] })
  })

  it('extracts a multi-line dash array property', () => {
    const content = `---
authors:
  - Alice
  - Bob
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ authors: ['Alice', 'Bob'] })
  })

  it('extracts multiple properties', () => {
    const content = `---
status: draft
priority: 1
tags: [x, y]
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({
      status: ['draft'],
      priority: ['1'],
      tags: ['x', 'y'],
    })
  })

  it('skips nested objects', () => {
    const content = `---
simple: value
nested: {a: 1, b: 2}
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ simple: ['value'] })
  })

  it('skips block scalar indicators (| and >)', () => {
    const content = `---
title: Hello
description: |
  This is a multi-line
  description
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ title: ['Hello'] })
  })

  it('returns empty object when no frontmatter is present', () => {
    const content = '# Just a heading\nSome content'
    const result = extractProperties(content)
    expect(result).toEqual({})
  })

  it('returns empty object for invalid/unclosed frontmatter', () => {
    const content = `---
status: aktiv
No closing delimiter`
    const result = extractProperties(content)
    expect(result).toEqual({})
  })

  it('returns empty object for empty frontmatter block', () => {
    const content = `---
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({})
  })

  it('handles quoted string values', () => {
    const content = `---
title: "Hello World"
author: 'Jane Doe'
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({
      title: ['Hello World'],
      author: ['Jane Doe'],
    })
  })

  it('handles quoted values in inline arrays', () => {
    const content = `---
tags: ["one", "two", "three"]
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ tags: ['one', 'two', 'three'] })
  })

  it('skips comment lines in frontmatter', () => {
    const content = `---
# This is a comment
status: active
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({ status: ['active'] })
  })

  it('handles empty string value (key with no value after colon)', () => {
    const content = `---
empty:
other: value
---
# Content`
    // 'empty:' with no value and no dash-items → skipped
    const result = extractProperties(content)
    expect(result).toEqual({ other: ['value'] })
  })

  it('handles keys with hyphens and underscores', () => {
    const content = `---
my-key: value1
my_key: value2
---
# Content`
    const result = extractProperties(content)
    expect(result).toEqual({
      'my-key': ['value1'],
      'my_key': ['value2'],
    })
  })

  it('returns empty object for completely empty content', () => {
    expect(extractProperties('')).toEqual({})
  })
})
