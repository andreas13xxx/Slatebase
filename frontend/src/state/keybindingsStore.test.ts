import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { IApiClient } from '../api'
import {
  initialize,
  loadVaultHotkeys,
  getShortcut,
  getShortcuts,
  setShortcut,
  addShortcut,
  removeShortcut,
  resetShortcut,
  resetAll,
  findConflict,
  matchesShortcut,
  isOverridden,
  onKeybindingsChange,
  disconnect,
  _reset,
} from './keybindingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

const mod = (key: string, ...modifiers: string[]) => ({ modifiers: ['Mod', ...modifiers], key })

/** An API client over an in-memory hotkeys.json, applying PATCH like the server does. */
function createClient(initialFile: Record<string, unknown> = {}, legacy: Array<{ commandId: string; shortcut: string }> = []) {
  let file = { ...initialFile }
  const client = {
    getHotkeysConfig: vi.fn(async () => ({ ...file })),
    patchHotkeysConfig: vi.fn(async (_vaultId: string, patch: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete file[k]
        else file[k] = v
      }
      return { ...file }
    }),
    getKeybindings: vi.fn(async () => ({ entries: legacy })),
  }
  return { client: client as unknown as IApiClient, mocks: client, file: () => file, setFile: (f: Record<string, unknown>) => { file = f } }
}

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('keybindingsStore — hotkeys.json', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _reset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the defaults until the file names a command', async () => {
    const { client } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')
    expect(getShortcut('slatebase:open-command-palette')).toBe('Mod+P')
    expect(isOverridden('slatebase:open-command-palette')).toBe(false)
  })

  it('reads Obsidian IDs as Slatebase commands; an empty list unbinds', async () => {
    const { client } = createClient({
      'command-palette:open': [mod('K')],
      'app:go-back': [],
      'some-plugin:run': [{ modifiers: ['Alt'], key: 'R' }],
    })
    await initialize(client)
    await loadVaultHotkeys('v1')
    expect(getShortcuts('slatebase:open-command-palette')).toEqual(['Mod+K'])
    expect(getShortcuts('slatebase:navigate-back')).toEqual([])
    expect(getShortcut('some-plugin:run')).toBe('Alt+R')
  })

  it('writes a change debounced, under Obsidian\'s command ID and format', async () => {
    const { client, mocks } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')

    setShortcut('slatebase:open-settings', 'Mod+Shift+S')
    setShortcut('slatebase:open-settings', 'Mod+Alt+S')
    expect(mocks.patchHotkeysConfig).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)

    expect(mocks.patchHotkeysConfig).toHaveBeenCalledTimes(1)
    expect(mocks.patchHotkeysConfig).toHaveBeenCalledWith('v1', { 'app:open-settings': [{ modifiers: ['Mod', 'Alt'], key: 'S' }] })
  })

  it('unbinds with an empty list and resets by removing the entry', async () => {
    const { client, mocks, file } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')

    setShortcut('slatebase:open-command-palette', '')
    await vi.advanceTimersByTimeAsync(600)
    expect(file()['command-palette:open']).toEqual([])
    expect(getShortcut('slatebase:open-command-palette')).toBe('')

    resetShortcut('slatebase:open-command-palette')
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.patchHotkeysConfig).toHaveBeenLastCalledWith('v1', { 'command-palette:open': null })
    expect('command-palette:open' in file()).toBe(false)
    expect(getShortcut('slatebase:open-command-palette')).toBe('Mod+P')
  })

  it('adds and removes single shortcuts of a command', async () => {
    const { client } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')

    addShortcut('slatebase:open-command-palette', 'Mod+Shift+P')
    addShortcut('slatebase:open-command-palette', 'Ctrl+Shift+P') // same keys as Mod+Shift+P on this platform
    expect(getShortcuts('slatebase:open-command-palette')).toEqual(['Mod+P', 'Mod+Shift+P'])
    removeShortcut('slatebase:open-command-palette', 'Mod+P')
    expect(getShortcuts('slatebase:open-command-palette')).toEqual(['Mod+Shift+P'])
  })

  it('resetAll removes the entries of Slatebase\'s commands', async () => {
    const { client, file } = createClient({ 'app:go-back': [], 'plugin:x': [mod('X')] })
    await initialize(client)
    await loadVaultHotkeys('v1')
    resetAll()
    await vi.advanceTimersByTimeAsync(600)
    expect(file()).toEqual({ 'plugin:x': [mod('X')] })
  })

  it('does not replace unwritten changes with the file, and takes the file when it changed elsewhere', async () => {
    const { client, setFile } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')

    setShortcut('slatebase:open-settings', 'Mod+K')
    expect(await loadVaultHotkeys('v1')).toBe(false)
    expect(getShortcut('slatebase:open-settings')).toBe('Mod+K')
    await vi.advanceTimersByTimeAsync(600)

    setFile({ 'app:open-settings': [mod('J')] })
    expect(await loadVaultHotkeys('v1')).toBe(true)
    expect(getShortcut('slatebase:open-settings')).toBe('Mod+J')
  })

  it('keeps a failed change queued and writes it on the retry', async () => {
    const { client, mocks, file } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')
    mocks.patchHotkeysConfig.mockRejectedValueOnce(new Error('offline'))

    setShortcut('slatebase:open-settings', 'Mod+K')
    await vi.advanceTimersByTimeAsync(600)
    expect(file()['app:open-settings']).toBeUndefined()
    expect(getShortcut('slatebase:open-settings')).toBe('Mod+K')

    await vi.advanceTimersByTimeAsync(31_000)
    expect(file()['app:open-settings']).toEqual([mod('K')])
  })

  it('does not show the previous vault\'s bindings in another vault', async () => {
    const a = createClient({ 'app:open-settings': [mod('J')] })
    await initialize(a.client)
    await loadVaultHotkeys('a')
    expect(getShortcut('slatebase:open-settings')).toBe('Mod+J')

    const b = createClient()
    await initialize(b.client)
    await loadVaultHotkeys('b')
    expect(getShortcut('slatebase:open-settings')).toBe('Ctrl+,')
  })

  it('tells listeners about changes', async () => {
    const { client } = createClient({ 'app:go-back': [] })
    await initialize(client)
    const cb = vi.fn()
    const off = onKeybindingsChange(cb)
    await loadVaultHotkeys('v1')
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    off()
    setShortcut('slatebase:open-settings', 'Mod+K')
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('keybindingsStore — taking over the per-user bindings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _reset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the old bindings the file does not name, once, and the file wins', async () => {
    const { client, mocks, file } = createClient(
      { 'app:open-settings': [mod('J')] },
      [
        { commandId: 'slatebase:open-settings', shortcut: 'Ctrl+X' },
        { commandId: 'slatebase:toggle-theme', shortcut: 'Mod+Shift+L' },
        { commandId: 'slatebase:navigate-back', shortcut: '' },
      ],
    )
    await initialize(client)
    await loadVaultHotkeys('v1')

    expect(mocks.patchHotkeysConfig).toHaveBeenCalledWith('v1', {
      'slatebase:toggle-theme': [{ modifiers: ['Mod', 'Shift'], key: 'L' }],
      'app:go-back': [],
    })
    expect(file()['app:open-settings']).toEqual([mod('J')])
    expect(getShortcut('slatebase:toggle-theme')).toBe('Mod+Shift+L')
    expect(getShortcut('slatebase:open-settings')).toBe('Mod+J')

    mocks.patchHotkeysConfig.mockClear()
    await loadVaultHotkeys('v1')
    expect(mocks.patchHotkeysConfig).not.toHaveBeenCalled()
  })

  it('tries again next time when the file cannot be written', async () => {
    const { client, mocks } = createClient({}, [{ commandId: 'slatebase:toggle-theme', shortcut: 'Mod+Shift+L' }])
    mocks.patchHotkeysConfig.mockRejectedValueOnce(new Error('403'))
    await initialize(client)
    await loadVaultHotkeys('v1')
    expect(getShortcut('slatebase:toggle-theme')).toBe('')

    await loadVaultHotkeys('v1')
    expect(getShortcut('slatebase:toggle-theme')).toBe('Mod+Shift+L')
  })

  it('reads the browser cache of the old store when the server list is unavailable', async () => {
    localStorage.setItem('slatebase:keybindings', JSON.stringify([{ commandId: 'slatebase:toggle-theme', shortcut: 'Mod+Shift+L' }]))
    const { client, mocks } = createClient()
    mocks.getKeybindings.mockRejectedValueOnce(new Error('offline'))
    await initialize(client)
    await loadVaultHotkeys('v1')
    expect(getShortcut('slatebase:toggle-theme')).toBe('Mod+Shift+L')
  })
})

describe('keybindingsStore — matching and conflicts', () => {
  beforeEach(async () => {
    _reset()
    const { client } = createClient({ 'plugin:x': [mod('Q')] })
    await initialize(client)
    await loadVaultHotkeys('v1')
  })

  it('matches any of a command\'s shortcuts', () => {
    addShortcut('slatebase:open-settings', 'Alt+Space')
    expect(matchesShortcut('slatebase:open-settings', keyEvent({ key: ',', ctrlKey: true }))).toBe(true)
    expect(matchesShortcut('slatebase:open-settings', keyEvent({ key: ' ', altKey: true }))).toBe(true)
    expect(matchesShortcut('slatebase:open-settings', keyEvent({ key: ',' }))).toBe(false)
  })

  it('finds a conflict with a built-in and with a plugin command, treating Mod and Ctrl alike', () => {
    expect(findConflict('Ctrl+P', 'slatebase:open-settings')).toBe('slatebase:open-command-palette')
    expect(findConflict('Mod+Q', 'slatebase:open-settings')).toBe('plugin:x')
    expect(findConflict('Mod+Q', 'plugin:x')).toBeNull()
    expect(findConflict('Mod+F9', 'slatebase:open-settings')).toBeNull()
  })
})

describe('keybindingsStore — safety', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _reset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resetAll leaves the bindings of other commands in the file alone', async () => {
    const { client, file } = createClient({ 'app:go-back': [], 'obsidian-git:push': [mod('G')] })
    await initialize(client)
    await loadVaultHotkeys('v1')
    resetAll()
    await vi.advanceTimersByTimeAsync(600)
    expect(file()).toEqual({ 'obsidian-git:push': [mod('G')] })
  })

  it('writes a change to the vault it was made in when another vault is opened meanwhile', async () => {
    const a = createClient()
    await initialize(a.client)
    await loadVaultHotkeys('a')
    setShortcut('slatebase:open-settings', 'Mod+K')

    const b = createClient()
    // Same store, another vault: switch the client the way the app does (one client per session).
    await initialize({ ...a.mocks, getHotkeysConfig: b.mocks.getHotkeysConfig, getKeybindings: b.mocks.getKeybindings } as unknown as IApiClient)
    await loadVaultHotkeys('b')
    await vi.advanceTimersByTimeAsync(600)

    expect(a.mocks.patchHotkeysConfig).toHaveBeenCalledWith('a', { 'app:open-settings': [mod('K')] })
    expect(a.mocks.patchHotkeysConfig).not.toHaveBeenCalledWith('b', expect.anything())
    expect(getShortcut('slatebase:open-settings')).toBe('Ctrl+,')
  })

  it('a default gives way when the file binds its keys to another command', async () => {
    const { client } = createClient({ 'plugin:x': [mod('P')] })
    await initialize(client)
    await loadVaultHotkeys('v1')
    expect(getShortcuts('slatebase:open-command-palette')).toEqual([])
    expect(getShortcut('plugin:x')).toBe('Mod+P')
  })

  it('reads the file again when it changed elsewhere while our change was unwritten', async () => {
    const { client, setFile, mocks } = createClient()
    await initialize(client)
    await loadVaultHotkeys('v1')
    setShortcut('slatebase:open-settings', 'Mod+K')
    setFile({ 'app:go-back': [mod('Q')] })
    expect(await loadVaultHotkeys('v1')).toBe(false)

    await vi.advanceTimersByTimeAsync(700)
    expect(mocks.getHotkeysConfig.mock.calls.length).toBeGreaterThan(1)
    expect(getShortcut('slatebase:navigate-back')).toBe('Mod+Q')
  })

  it('forgets the caches and markers of the account on disconnect', async () => {
    const { client } = createClient({ 'app:go-back': [] }, [{ commandId: 'slatebase:toggle-theme', shortcut: 'Mod+Shift+L' }])
    await initialize(client)
    await loadVaultHotkeys('v1')
    expect(localStorage.getItem('slatebase:hotkeys:v1')).not.toBeNull()
    expect(localStorage.getItem('slatebase:hotkeys-taken-over:v1')).not.toBeNull()
    disconnect()
    expect(localStorage.getItem('slatebase:hotkeys:v1')).toBeNull()
    expect(localStorage.getItem('slatebase:hotkeys-taken-over:v1')).toBeNull()
  })
})
