import { describe, it, expect } from 'vitest'
import {
  McpAuthenticationError,
  TokenLimitError,
  TokenValidationError,
  McpRateLimitError,
  McpDisabledError,
  TokenNotFoundError,
} from './errors.js'

describe('MCP error classes', () => {
  it('McpAuthenticationError carries its code and a descriptive message', () => {
    const err = new McpAuthenticationError('TOKEN_EXPIRED')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('McpAuthenticationError')
    expect(err.code).toBe('TOKEN_EXPIRED')
    expect(err.message).toBe('MCP authentication failed: TOKEN_EXPIRED')
  })

  it('TokenLimitError includes the configured max in its message', () => {
    const err = new TokenLimitError(10)
    expect(err.name).toBe('TokenLimitError')
    expect(err.maxTokens).toBe(10)
    expect(err.message).toBe('Token limit reached: maximum 10 active tokens per user')
  })

  it('TokenValidationError preserves its code and custom message', () => {
    const err = new TokenValidationError('NAME_TOO_LONG', 'Name exceeds 64 characters')
    expect(err.name).toBe('TokenValidationError')
    expect(err.code).toBe('NAME_TOO_LONG')
    expect(err.message).toBe('Name exceeds 64 characters')
  })

  it('McpRateLimitError includes the retry-after value', () => {
    const err = new McpRateLimitError(30)
    expect(err.name).toBe('McpRateLimitError')
    expect(err.retryAfter).toBe(30)
    expect(err.message).toBe('MCP rate limit exceeded. Retry after 30 seconds')
  })

  it('McpDisabledError has a fixed descriptive message', () => {
    const err = new McpDisabledError()
    expect(err.name).toBe('McpDisabledError')
    expect(err.message).toBe('MCP functionality is disabled')
  })

  it('TokenNotFoundError includes the missing token id', () => {
    const err = new TokenNotFoundError('tok-123')
    expect(err.name).toBe('TokenNotFoundError')
    expect(err.tokenId).toBe('tok-123')
    expect(err.message).toBe('Token not found: tok-123')
  })
})
