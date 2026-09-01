import { describe, it, expect, beforeEach, vi } from 'vitest'
import { zoomIn, zoomOut, resetZoom, getZoom, MIN_ZOOM, MAX_ZOOM } from './zoomStore'
import {
  _reset as resetVaultSettings,
  setActiveVault,
  getVaultSettings,
} from './vaultSettingsStore'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

describe('zoomStore', () => {
  beforeEach(async () => {
    resetVaultSettings()
    await setActiveVault('vault-1')
  })

  it('starts at 100%', () => {
    expect(getZoom()).toBe(1)
  })

  it('zoomIn increases by the step', () => {
    zoomIn()
    expect(getZoom()).toBeCloseTo(1.1, 5)
  })

  it('zoomOut decreases by the step', () => {
    zoomOut()
    expect(getZoom()).toBeCloseTo(0.9, 5)
  })

  it('clamps zoomIn at MAX_ZOOM', () => {
    for (let i = 0; i < 30; i++) zoomIn()
    expect(getZoom()).toBe(MAX_ZOOM)
  })

  it('clamps zoomOut at MIN_ZOOM', () => {
    for (let i = 0; i < 30; i++) zoomOut()
    expect(getZoom()).toBe(MIN_ZOOM)
  })

  it('resetZoom returns to 100%', () => {
    zoomIn()
    zoomIn()
    resetZoom()
    expect(getZoom()).toBe(1)
  })

  it('stores the level in the active vault’s settings', () => {
    zoomIn()
    expect(getVaultSettings().zoom).toBeCloseTo(1.1, 5)
  })

  it('keeps the zoom level separate per vault', async () => {
    zoomIn()
    expect(getZoom()).toBeCloseTo(1.1, 5)

    await setActiveVault('vault-2')

    expect(getZoom()).toBe(1)
  })

  it('avoids float drift across repeated steps', () => {
    for (let i = 0; i < 3; i++) zoomIn()
    for (let i = 0; i < 3; i++) zoomOut()
    expect(getZoom()).toBe(1)
  })
})
