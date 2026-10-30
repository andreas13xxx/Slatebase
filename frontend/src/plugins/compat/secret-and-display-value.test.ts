import { describe, it, expect, vi } from 'vitest'
import { SecretComponent, DisplayValueComponent, Setting } from './setting-tab'
import { SecretStorage, getVaultSecretStorage } from './obsidian-api-extensions'

describe('SecretComponent (Obsidian 1.11.4+)', () => {
  it('renders a password-type input', () => {
    const container = document.createElement('div')
    new SecretComponent({}, container)
    const input = container.querySelector('input')
    expect(input?.type).toBe('password')
  })

  it('setValue() sets the input value', () => {
    const container = document.createElement('div')
    const secret = new SecretComponent({}, container)
    secret.setValue('sk-abc123')
    expect(container.querySelector('input')?.value).toBe('sk-abc123')
  })

  it('onChange() fires with the new value, or null when cleared', () => {
    const container = document.createElement('div')
    const secret = new SecretComponent({}, container)
    const values: (string | null)[] = []
    secret.onChange((v) => values.push(v))

    const input = container.querySelector('input') as HTMLInputElement
    input.value = 'token'
    input.dispatchEvent(new Event('input'))
    input.value = ''
    input.dispatchEvent(new Event('input'))

    expect(values).toEqual(['token', null])
  })
})

describe('DisplayValueComponent (Obsidian 1.13.1+)', () => {
  it('renders a read-only label with the given value', () => {
    const container = document.createElement('div')
    const display = new DisplayValueComponent(container)
    display.setValue('42 MB')
    expect(display.valueEl.textContent).toBe('42 MB')
  })
})

describe('Setting.addComponent()/addDisplayValue() (Obsidian 1.11.0+/1.13.1+)', () => {
  it('addComponent() constructs the component and adds it to the row', () => {
    const container = document.createElement('div')
    const setting = new Setting(container)
    let received: SecretComponent | undefined
    setting.addComponent((el) => {
      const c = new SecretComponent({}, el)
      received = c
      return c
    })
    expect(received).toBeInstanceOf(SecretComponent)
    expect(container.querySelector('input[type=password]')).not.toBeNull()
  })

  it('addDisplayValue() adds a DisplayValueComponent to the row', () => {
    const container = document.createElement('div')
    const setting = new Setting(container)
    setting.addDisplayValue((c) => c.setValue('done'))
    expect(container.querySelector('.setting-display-value')?.textContent).toBe('done')
  })
})

describe('SecretStorage (Obsidian 1.11.4+)', () => {
  function createMockApiClient(initial: Record<string, string> = {}) {
    const secrets = new Map<string, string>(Object.entries(initial))
    return {
      secrets,
      listKeychainSecrets: async () => Array.from(secrets.keys()),
      getKeychainSecret: async (_v: string, id: string) => secrets.get(id) ?? null,
      setKeychainSecret: async (_v: string, id: string, value: string) => { secrets.set(id, value) },
    }
  }

  it('setSecret()/getSecret() round-trip via cache', () => {
    const storage = new SecretStorage({ apiClient: createMockApiClient(), vaultId: 'v1' })
    storage.setSecret('api-key', 'sk-xyz')
    expect(storage.getSecret('api-key')).toBe('sk-xyz')
    expect(storage.getSecret('missing')).toBeNull()
  })

  it('writes through to the API', async () => {
    const apiClient = createMockApiClient()
    const storage = new SecretStorage({ apiClient, vaultId: 'v1' })
    storage.setSecret('k', 'v')
    await Promise.resolve()
    expect(apiClient.secrets.get('k')).toBe('v')
  })

  it('listSecrets() returns the ids of the vault', () => {
    const storage = new SecretStorage({ apiClient: createMockApiClient(), vaultId: 'v1' })
    storage.setSecret('a', '1')
    storage.setSecret('b', '2')
    expect(storage.listSecrets().sort()).toEqual(['a', 'b'])
  })

  it('setSecret() triggers a change event', () => {
    const storage = new SecretStorage({ apiClient: createMockApiClient(), vaultId: 'v1' })
    const changed: string[] = []
    storage.on('change', (id) => changed.push(id as string))
    storage.setSecret('k', 'v')
    expect(changed).toEqual(['k'])
  })

  it('rejects IDs outside the Obsidian format', () => {
    const storage = new SecretStorage({ apiClient: createMockApiClient(), vaultId: 'v1' })
    for (const id of ['Key', 'a_b', 'a--b', '-a', '']) expect(() => storage.setSecret(id, 'x')).toThrow(/Invalid secret ID/)
  })

  it('takes back the cached value when the server refuses it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const apiClient = { ...createMockApiClient({ k: 'old' }), setKeychainSecret: async () => { throw new Error('403') } }
    const storage = new SecretStorage({ apiClient, vaultId: 'v1' })
    await storage.initialize()
    const changed: string[] = []
    storage.on('change', (id) => changed.push(id as string))

    storage.setSecret('k', 'new')
    expect(storage.getSecret('k')).toBe('new')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(storage.getSecret('k')).toBe('old')
    expect(changed).toEqual(['k', 'k'])
    warn.mockRestore()
  })

  it('initialize() loads secrets from the API into cache', async () => {
    const storage = new SecretStorage({ apiClient: createMockApiClient({ existing: 'val1' }), vaultId: 'v1' })
    await storage.initialize()
    expect(storage.getSecret('existing')).toBe('val1')
  })

  it('reload() picks up changes made elsewhere and announces removed entries', async () => {
    const apiClient = createMockApiClient({ a: '1', b: '2' })
    const storage = new SecretStorage({ apiClient, vaultId: 'v1' })
    await storage.initialize()
    const changed: string[] = []
    storage.on('change', (id) => changed.push(id as string))

    apiClient.secrets.delete('b')
    apiClient.secrets.set('c', '3')
    await storage.reload()

    expect(storage.listSecrets().sort()).toEqual(['a', 'c'])
    expect(changed).toEqual(['b'])
  })

  it('stays usable (empty) when the API is unavailable', async () => {
    const apiClient = { ...createMockApiClient(), listKeychainSecrets: async () => { throw new Error('offline') } }
    const storage = new SecretStorage({ apiClient, vaultId: 'v1' })
    await expect(storage.initialize()).resolves.toBeUndefined()
    expect(storage.listSecrets()).toEqual([])
  })

  it('getVaultSecretStorage() shares one instance per vault', () => {
    const apiClient = createMockApiClient()
    expect(getVaultSecretStorage(apiClient, 'shared-vault')).toBe(getVaultSecretStorage(apiClient, 'shared-vault'))
    expect(getVaultSecretStorage(apiClient, 'other-vault')).not.toBe(getVaultSecretStorage(apiClient, 'shared-vault'))
  })
})
