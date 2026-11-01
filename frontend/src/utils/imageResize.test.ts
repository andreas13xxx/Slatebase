import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  resizeImageToDataUrl,
  imageBlobFromClipboard,
  ImageResizeError,
  MAX_AVATAR_DATA_URL_LENGTH,
} from './imageResize'

// jsdom has no real canvas or image decoder, so we stub the pieces
// resizeImageToDataUrl touches: Image loading, getContext, toDataURL.

let toDataUrlResult = 'data:image/webp;base64,SMALL'
let decodeSucceeds = true

beforeEach(() => {
  toDataUrlResult = 'data:image/webp;base64,SMALL'
  decodeSucceeds = true

  // URL.createObjectURL / revokeObjectURL are not in jsdom by default.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })

  // Image: fire onload (or onerror) on the next microtask after src is set.
  class MockImage {
    width = 256
    height = 128
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_v: string) {
      queueMicrotask(() => {
        if (decodeSucceeds) this.onload?.()
        else this.onerror?.()
      })
    }
  }
  vi.stubGlobal('Image', MockImage)

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    () => toDataUrlResult,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('resizeImageToDataUrl', () => {
  it('returns a webp data URL for a decodable image', async () => {
    const result = await resizeImageToDataUrl(new Blob(['x'], { type: 'image/png' }))
    expect(result).toBe('data:image/webp;base64,SMALL')
  })

  it('rejects a result that exceeds the size limit', async () => {
    toDataUrlResult = 'data:image/webp;base64,' + 'A'.repeat(MAX_AVATAR_DATA_URL_LENGTH)
    await expect(
      resizeImageToDataUrl(new Blob(['x'], { type: 'image/png' })),
    ).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('throws DECODE_FAILED when the image cannot be decoded', async () => {
    decodeSucceeds = false
    await expect(
      resizeImageToDataUrl(new Blob(['x'], { type: 'image/png' })),
    ).rejects.toBeInstanceOf(ImageResizeError)
  })

  it('falls back to PNG when the browser cannot encode WebP', async () => {
    // A browser without WebP encoding returns a PNG from the first toDataURL.
    toDataUrlResult = 'data:image/png;base64,PNGDATA'
    const result = await resizeImageToDataUrl(new Blob(['x'], { type: 'image/png' }))
    expect(result.startsWith('data:image/png')).toBe(true)
  })
})

describe('imageBlobFromClipboard', () => {
  function clipboardEvent(items: Array<{ kind: string; type: string; file: File | null }>): ClipboardEvent {
    return {
      clipboardData: {
        items: items.map((i) => ({
          kind: i.kind,
          type: i.type,
          getAsFile: () => i.file,
        })),
      },
    } as unknown as ClipboardEvent
  }

  it('returns the first image file', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const blob = imageBlobFromClipboard(
      clipboardEvent([
        { kind: 'string', type: 'text/plain', file: null },
        { kind: 'file', type: 'image/png', file },
      ]),
    )
    expect(blob).toBe(file)
  })

  it('returns null when there is no image', () => {
    const blob = imageBlobFromClipboard(
      clipboardEvent([{ kind: 'string', type: 'text/plain', file: null }]),
    )
    expect(blob).toBeNull()
  })
})
