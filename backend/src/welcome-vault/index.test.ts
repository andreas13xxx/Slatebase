import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WelcomeVaultService } from './index.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultService } from '../business/index.js'
import type { WelcomeVaultConfig } from './types.js'

function createMockLogger(): ILogger & { warnCalls: unknown[][]; errorCalls: unknown[][] } {
  const warnCalls: unknown[][] = []
  const errorCalls: unknown[][] = []
  return {
    warnCalls,
    errorCalls,
    debug: () => {},
    info: () => {},
    warn: (...args: unknown[]) => { warnCalls.push(args) },
    error: (...args: unknown[]) => { errorCalls.push(args) },
  }
}

const CONFIG: WelcomeVaultConfig = { name: { de: 'Willkommen', en: 'Welcome' } }

describe('WelcomeVaultService', () => {
  let templatesRoot: string
  let vaultsRoot: string
  let createVault: ReturnType<typeof vi.fn>
  let vaultService: IVaultService

  beforeEach(async () => {
    templatesRoot = await mkdtemp(path.join(tmpdir(), 'welcome-templates-'))
    vaultsRoot = await mkdtemp(path.join(tmpdir(), 'welcome-vaults-'))
    createVault = vi.fn(async (name: string) => ({
      id: 'vault-1',
      name,
      path: vaultsRoot,
      status: 'loaded' as const,
    }))
    vaultService = { createVault } as unknown as IVaultService
  })

  afterEach(async () => {
    await rm(templatesRoot, { recursive: true, force: true })
    await rm(vaultsRoot, { recursive: true, force: true })
  })

  function service(logger: ILogger): WelcomeVaultService {
    return new WelcomeVaultService(vaultService, CONFIG, logger, templatesRoot)
  }

  it('creates the vault and copies template files for the German template dir', async () => {
    const deDir = path.join(templatesRoot, 'welcome-vault')
    await mkdir(deDir, { recursive: true })
    await writeFile(path.join(deDir, 'Willkommen.md'), '# Hallo', 'utf-8')

    const logger = createMockLogger()
    const result = await service(logger).createWelcomeVault('user-1', 'de')

    expect(result).toEqual({ vaultId: 'vault-1', storagePath: vaultsRoot, vaultName: 'Willkommen' })
    expect(createVault).toHaveBeenCalledWith('Willkommen', 'user-1')
    const copied = await readFile(path.join(vaultsRoot, 'Willkommen.md'), 'utf-8')
    expect(copied).toBe('# Hallo')
  })

  it('uses the English template dir and config name for language "en"', async () => {
    const enDir = path.join(templatesRoot, 'welcome-vault-en')
    await mkdir(enDir, { recursive: true })
    await writeFile(path.join(enDir, 'Welcome.md'), '# Hi', 'utf-8')

    const result = await service(createMockLogger()).createWelcomeVault('user-1', 'en')

    expect(result?.vaultName).toBe('Welcome')
    expect(createVault).toHaveBeenCalledWith('Welcome', 'user-1')
  })

  it('uses overrideName instead of the config name when provided', async () => {
    await mkdir(path.join(templatesRoot, 'welcome-vault'), { recursive: true })

    const result = await service(createMockLogger()).createWelcomeVault('user-1', 'de', 'Willkommen (2)')

    expect(result?.vaultName).toBe('Willkommen (2)')
    expect(createVault).toHaveBeenCalledWith('Willkommen (2)', 'user-1')
  })

  it('recursively copies nested template directories preserving relative paths', async () => {
    const deDir = path.join(templatesRoot, 'welcome-vault')
    await mkdir(path.join(deDir, 'Basics'), { recursive: true })
    await writeFile(path.join(deDir, 'Basics', 'Intro.md'), 'intro', 'utf-8')

    await service(createMockLogger()).createWelcomeVault('user-1', 'de')

    const copied = await readFile(path.join(vaultsRoot, 'Basics', 'Intro.md'), 'utf-8')
    expect(copied).toBe('intro')
  })

  it('warns and still succeeds when the template directory does not exist', async () => {
    const logger = createMockLogger()
    const result = await service(logger).createWelcomeVault('user-1', 'de')

    expect(result).toEqual({ vaultId: 'vault-1', storagePath: vaultsRoot, vaultName: 'Willkommen' })
    expect(logger.warnCalls[0]?.[0]).toBe('Welcome vault template directory not found')
  })

  it('warns when the template directory exists but is empty', async () => {
    await mkdir(path.join(templatesRoot, 'welcome-vault'), { recursive: true })

    const logger = createMockLogger()
    const result = await service(logger).createWelcomeVault('user-1', 'de')

    expect(result).toBeDefined()
    expect(logger.warnCalls[0]?.[0]).toBe('Welcome vault template directory is empty')
  })

  it('never throws — logs and returns undefined when vault creation fails', async () => {
    createVault.mockRejectedValueOnce(new Error('disk full'))
    const logger = createMockLogger()

    const result = await service(logger).createWelcomeVault('user-1', 'de')

    expect(result).toBeUndefined()
    expect(logger.errorCalls[0]?.[0]).toBe('Failed to create welcome vault')
  })
})
