/**
 * Client-side image downscaling for the configurable avatar.
 *
 * A picked or pasted image is drawn into a square `<canvas>` (aspect-ratio
 * preserving, centre-cropped) and exported as a data URL. WebP is tried first
 * (much smaller) with a PNG fallback for browsers that cannot encode WebP. The
 * result is rejected if it still exceeds the backend's avatar-data limit, so
 * the server never has to reject an oversized payload after upload.
 */

/** Default target edge length (px). The avatar is square. */
export const AVATAR_IMAGE_SIZE = 128

/**
 * Maximum length of the produced data URL, matching the backend
 * `MAX_AVATAR_DATA_LENGTH` (~256 KB of raw bytes at base64 overhead 4/3).
 */
export const MAX_AVATAR_DATA_URL_LENGTH = 358_000

/** Error thrown when the downscaled image is still too large or cannot be read. */
export class ImageResizeError extends Error {
  readonly code: 'TOO_LARGE' | 'DECODE_FAILED' | 'CANVAS_UNAVAILABLE'

  constructor(code: 'TOO_LARGE' | 'DECODE_FAILED' | 'CANVAS_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'ImageResizeError'
    this.code = code
  }
}

/**
 * Loads an image Blob into an `HTMLImageElement`.
 */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageResizeError('DECODE_FAILED', 'Could not decode the image'))
    }
    img.src = url
  })
}

/**
 * Downscales an image Blob to a square `max`×`max` data URL.
 *
 * The source is centre-cropped to a square, then drawn at `max`×`max`. The
 * output is WebP at quality 0.9, falling back to PNG when WebP encoding is not
 * supported. Throws {@link ImageResizeError} with code `TOO_LARGE` when the
 * result exceeds {@link MAX_AVATAR_DATA_URL_LENGTH}.
 */
export async function resizeImageToDataUrl(
  blob: Blob,
  max: number = AVATAR_IMAGE_SIZE,
): Promise<string> {
  const img = await loadImage(blob)

  const canvas = document.createElement('canvas')
  canvas.width = max
  canvas.height = max
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new ImageResizeError('CANVAS_UNAVAILABLE', 'Canvas 2D context is unavailable')
  }

  // Centre-crop the source to a square before scaling.
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2
  const sy = (img.height - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max)

  let dataUrl = canvas.toDataURL('image/webp', 0.9)
  // Browsers that cannot encode WebP return a PNG data URL from toDataURL;
  // detect that and keep whichever we actually got (PNG is the valid fallback).
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/png')
  }

  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new ImageResizeError(
      'TOO_LARGE',
      'The image is still too large after downscaling (max ~256 KB)',
    )
  }

  return dataUrl
}

/**
 * Extracts the first image Blob from a paste `ClipboardEvent`, or `null` when
 * the clipboard carries no image.
 */
export function imageBlobFromClipboard(event: ClipboardEvent): Blob | null {
  const items = event.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}
