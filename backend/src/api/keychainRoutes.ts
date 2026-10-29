// Keychain Routes — vault-scoped named secrets (Obsidian's `app.secretStorage`)
// Mounted at /vaults/:vaultId/keychain. Access levels are set in
// vault-authorization-middleware: listing IDs needs read access, reading a value
// and every change need write access.

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ILogger } from '../logger/index.js'
import type { IKeychainService } from '../keychain/index.js'
import {
  KeychainInvalidIdError,
  KeychainLimitExceededError,
  KEYCHAIN_SECRET_ID_MAX_LENGTH,
  KEYCHAIN_SECRET_ID_PATTERN,
} from '../keychain/index.js'
import { ModuleSecretTooLargeError } from '../shared-secrets/index.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiError(code: string, message: string): { code: string; message: string; timestamp: string } {
  return { code, message, timestamp: new Date().toISOString() }
}

const vaultIdSchema = z.string().min(1, 'vaultId must not be empty').max(24, 'vaultId too long')

const secretIdSchema = z.string()
  .min(1, 'secretId must not be empty')
  .max(KEYCHAIN_SECRET_ID_MAX_LENGTH, `secretId must not exceed ${KEYCHAIN_SECRET_ID_MAX_LENGTH} characters`)
  .regex(KEYCHAIN_SECRET_ID_PATTERN, 'Invalid secret ID: use lowercase letters, digits and single hyphens')

const setSecretBodySchema = z.object({
  value: z.string().min(1, 'Secret value must not be empty'),
})

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface KeychainRouteDependencies {
  keychainService: IKeychainService
  logger: ILogger
}

// ─── Factory Function ────────────────────────────────────────────────────────

export function createKeychainRoutes(deps: KeychainRouteDependencies): Hono {
  const { keychainService, logger } = deps
  const app = new Hono()

  const parseVaultId = (c: Context): string | Response => {
    const parsed = vaultIdSchema.safeParse(c.req.param('vaultId'))
    return parsed.success ? parsed.data : c.json(apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid vaultId'), 400)
  }

  const parseSecretId = (c: Context): string | Response => {
    const parsed = secretIdSchema.safeParse(c.req.param('secretId'))
    return parsed.success ? parsed.data : c.json(apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid secret ID'), 400)
  }

  const handleError = (c: Context, error: unknown): Response => {
    if (error instanceof KeychainInvalidIdError) return c.json(apiError('VALIDATION_ERROR', error.message), 400)
    if (error instanceof KeychainLimitExceededError) return c.json(apiError('SECRET_LIMIT_EXCEEDED', error.message), 409)
    if (error instanceof ModuleSecretTooLargeError) return c.json(apiError('SECRET_TOO_LARGE', error.message), 413)
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Keychain request failed', { error: message })
    return c.json(apiError('INTERNAL_ERROR', 'Keychain request failed'), 500)
  }

  // GET / — List entry IDs (NOT values)
  app.get('/', async (c: Context): Promise<Response> => {
    const vaultId = parseVaultId(c)
    if (typeof vaultId !== 'string') return vaultId
    try {
      return c.json({ ids: await keychainService.list(vaultId) }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  // GET /:secretId — Decrypted value
  app.get('/:secretId', async (c: Context): Promise<Response> => {
    const vaultId = parseVaultId(c)
    if (typeof vaultId !== 'string') return vaultId
    const secretId = parseSecretId(c)
    if (typeof secretId !== 'string') return secretId
    try {
      const value = await keychainService.get(vaultId, secretId)
      if (value === null) return c.json(apiError('SECRET_NOT_FOUND', `Secret "${secretId}" not found`), 404)
      return c.json({ value }, 200)
    } catch (error) {
      return handleError(c, error)
    }
  })

  // PUT /:secretId — Create or replace
  app.put('/:secretId', async (c: Context): Promise<Response> => {
    const vaultId = parseVaultId(c)
    if (typeof vaultId !== 'string') return vaultId
    const secretId = parseSecretId(c)
    if (typeof secretId !== 'string') return secretId

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(apiError('VALIDATION_ERROR', 'Request body must be valid JSON'), 400)
    }
    const parsed = setSecretBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json(apiError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request body'), 400)
    }

    try {
      await keychainService.set(vaultId, secretId, parsed.data.value)
      return c.body(null, 204)
    } catch (error) {
      return handleError(c, error)
    }
  })

  // DELETE /:secretId — Remove an entry
  app.delete('/:secretId', async (c: Context): Promise<Response> => {
    const vaultId = parseVaultId(c)
    if (typeof vaultId !== 'string') return vaultId
    const secretId = parseSecretId(c)
    if (typeof secretId !== 'string') return secretId
    try {
      await keychainService.delete(vaultId, secretId)
      return c.body(null, 204)
    } catch (error) {
      return handleError(c, error)
    }
  })

  return app
}
