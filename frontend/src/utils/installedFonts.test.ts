import { afterEach, describe, expect, it, vi } from 'vitest'
import { canQueryLocalFonts, detectInstalledFonts, queryAllInstalledFonts } from './installedFonts'

describe('installedFonts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts
  })

  it('detects a font whose text measures differently from the fallbacks', () => {
    let font = ''
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      set font(value: string) { font = value },
      get font() { return font },
      measureText: () => ({ width: font.includes('"Installed"') ? 200 : 100 }),
    } as unknown as CanvasRenderingContext2D)
    expect(detectInstalledFonts(['Installed', 'Missing'])).toEqual(['Installed'])
  })

  it('returns nothing without a canvas context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(detectInstalledFonts(['Arial'])).toEqual([])
  })

  it('lists local fonts sorted and unique when the browser supports it', async () => {
    expect(canQueryLocalFonts()).toBe(false)
    ;(window as unknown as { queryLocalFonts: () => Promise<Array<{ family: string }>> }).queryLocalFonts =
      async () => [{ family: 'Zed' }, { family: 'Alpha' }, { family: 'Zed' }]
    expect(canQueryLocalFonts()).toBe(true)
    expect(await queryAllInstalledFonts()).toEqual(['Alpha', 'Zed'])
  })
})
