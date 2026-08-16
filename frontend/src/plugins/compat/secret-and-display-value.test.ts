import { describe, it, expect } from 'vitest'
import { SecretComponent, DisplayValueComponent, Setting } from './setting-tab'
import { SecretStorage } from './obsidian-api-extensions'

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
  it('setSecret()/getSecret() round-trip via localStorage', () => {
    const storage = new SecretStorage('test-secret-prefix:')
    storage.setSecret('api-key', 'sk-xyz')
    expect(storage.getSecret('api-key')).toBe('sk-xyz')
    expect(storage.getSecret('missing')).toBeNull()
  })

  it('listSecrets() returns only ids under this instance\'s prefix', () => {
    const storage = new SecretStorage('test-secret-list:')
    const other = new SecretStorage('test-secret-other:')
    storage.setSecret('a', '1')
    storage.setSecret('b', '2')
    other.setSecret('c', '3')
    expect(storage.listSecrets().sort()).toEqual(['a', 'b'])
  })

  it('setSecret() triggers a change event', () => {
    const storage = new SecretStorage('test-secret-change:')
    const changed: string[] = []
    storage.on('change', (id) => changed.push(id as string))
    storage.setSecret('k', 'v')
    expect(changed).toEqual(['k'])
  })
})
