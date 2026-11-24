import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NATIVE_VIEWS, isNativeViewType, nativeViewTypeForExtension, openNativeView, type NativeViewHost } from './native-views'
import { consumePendingBasesView } from '../../state/basesViewBridge'
import { setViewTabHandler } from '../../state/viewTabBridge'

function createMockHost(commandResult = true): NativeViewHost & { openFile: ReturnType<typeof vi.fn>; executeCommand: ReturnType<typeof vi.fn> } {
  return { openFile: vi.fn(), executeCommand: vi.fn(() => commandResult) }
}

describe('nativeViewTypeForExtension', () => {
  it('maps extensions to Obsidian view types, case-insensitively', () => {
    expect(nativeViewTypeForExtension('md')).toBe('markdown')
    expect(nativeViewTypeForExtension('BASE')).toBe('bases')
    expect(nativeViewTypeForExtension('canvas')).toBe('canvas')
    expect(nativeViewTypeForExtension('png')).toBe('image')
  })

  it('returns null for an extension no native view claims', () => {
    expect(nativeViewTypeForExtension('xyz')).toBeNull()
  })

  it('claims each extension for exactly one view type', () => {
    const seen = new Map<string, string>()
    for (const [type, view] of Object.entries(NATIVE_VIEWS)) {
      if (view.kind !== 'file') continue
      for (const ext of view.extensions) {
        expect(seen.get(ext), `${ext} claimed twice`).toBeUndefined()
        seen.set(ext, type)
      }
    }
  })
})

describe('openNativeView', () => {
  beforeEach(() => {
    consumePendingBasesView('Tasks.base')
  })

  it('opens the file of a file view', () => {
    const host = createMockHost()
    expect(openNativeView('canvas', { file: 'a.canvas' }, host)).toBe(true)
    expect(host.openFile).toHaveBeenCalledWith('a.canvas')
  })

  it('parks the requested base view before opening the tab', () => {
    const host = createMockHost()
    host.openFile.mockImplementation(() => {
      expect(consumePendingBasesView('Tasks.base')).toBe('Open')
    })
    expect(openNativeView('bases', { file: 'Tasks.base', viewName: 'Open' }, host)).toBe(true)
    expect(host.openFile).toHaveBeenCalledWith('Tasks.base')
  })

  it('reports a file view without state.file as not opened', () => {
    const host = createMockHost()
    expect(openNativeView('bases', {}, host)).toBe(false)
    expect(host.openFile).not.toHaveBeenCalled()
  })

  it('runs the core command of a panel view', () => {
    const host = createMockHost()
    expect(openNativeView('outline', undefined, host)).toBe(true)
    expect(host.executeCommand).toHaveBeenCalledWith('outline:open')
  })

  it('asks the tab bridge for tab views, passing the file along', () => {
    const handler = vi.fn(() => true)
    const off = setViewTabHandler(handler)
    expect(openNativeView('empty', undefined, createMockHost())).toBe(true)
    expect(openNativeView('file-recovery', { file: 'a.md' }, createMockHost())).toBe(true)
    expect(handler.mock.calls).toEqual([[{ type: 'empty' }], [{ type: 'file-recovery', file: 'a.md' }]])
    off()
  })

  it('reports false for a tab view when no tab host is mounted', () => {
    expect(openNativeView('empty', undefined, createMockHost())).toBe(false)
  })

  it('reports false when the core command does not resolve', () => {
    expect(openNativeView('graph', undefined, createMockHost(false))).toBe(false)
  })

  it('does not treat an unknown type, or an Object.prototype name, as native', () => {
    const host = createMockHost()
    expect(openNativeView('some-plugin-view', {}, host)).toBe(false)
    expect(isNativeViewType('constructor')).toBe(false)
    expect(isNativeViewType('toString')).toBe(false)
  })
})
