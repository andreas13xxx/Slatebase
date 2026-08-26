import { describe, it, expect, afterEach } from 'vitest'
import { setActiveCanvasController, getActiveCanvasController } from './activeCanvasBridge'

describe('activeCanvasBridge', () => {
  afterEach(() => {
    setActiveCanvasController(null)
  })

  it('returns null when no canvas is registered', () => {
    expect(getActiveCanvasController()).toBeNull()
  })

  it('returns the registered controller', () => {
    const controller = { jumpToSelectedGroup: () => true }
    setActiveCanvasController(controller)
    expect(getActiveCanvasController()).toBe(controller)
  })

  it('clears the controller when set to null', () => {
    setActiveCanvasController({ jumpToSelectedGroup: () => true })
    setActiveCanvasController(null)
    expect(getActiveCanvasController()).toBeNull()
  })
})
