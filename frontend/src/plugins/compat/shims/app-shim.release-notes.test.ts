import { describe, it, expect, vi } from 'vitest'
import { createCommandManager } from './app-shim'
import type { ICommandRegistry } from '../command-registry'

describe('app.showReleaseNotes wiring', () => {
  it('executeCommandById runs the release notes core command', () => {
    const executeCommand = vi.fn()
    const registry = {
      getCommand: (id: string) => (id === 'app:show-release-notes' ? { id } : undefined),
      executeCommand,
    } as unknown as ICommandRegistry
    expect(createCommandManager(registry).executeCommandById('app:show-release-notes')).toBe(true)
    expect(executeCommand).toHaveBeenCalledWith('app:show-release-notes')
  })

  it('reports false when the command is not registered', () => {
    const registry = { getCommand: () => undefined, executeCommand: vi.fn() } as unknown as ICommandRegistry
    expect(createCommandManager(registry).executeCommandById('app:show-release-notes')).toBe(false)
  })
})
