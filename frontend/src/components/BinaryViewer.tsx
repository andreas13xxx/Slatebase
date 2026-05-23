import { useState } from 'react'

/**
 * BinaryViewer displays binary file content.
 * For supported image formats (PNG, JPEG, JPG, GIF, AVIF, WebP, SVG):
 *   renders an <img> element with src pointing to the raw file endpoint.
 * For unsupported binary formats:
 *   shows a notice with filename and file type.
 * Handles image load errors with a fallback notice.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

export interface BinaryViewerProps {
  fileName: string
  fileExtension: string
  vaultId: string
  filePath: string
}

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.avif', '.webp', '.svg']

function isSupportedImage(extension: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension.toLowerCase())
}

export function BinaryViewer({ fileName, fileExtension, vaultId, filePath }: BinaryViewerProps) {
  const [imageError, setImageError] = useState(false)

  const normalizedExtension = fileExtension.toLowerCase()
  const isImage = isSupportedImage(normalizedExtension)

  // Req 7.3: Image load error fallback
  if (isImage && imageError) {
    return (
      <section
        aria-label="Binärdatei-Ansicht"
        style={{ padding: '2rem', textAlign: 'center' }}
      >
        <p role="status" style={{ color: '#888', fontSize: '0.95rem' }}>
          Das Bild „{fileName}" konnte nicht geladen werden.
        </p>
      </section>
    )
  }

  // Req 7.2: Render image preview for supported formats
  if (isImage) {
    const src = `/api/v1/vaults/${vaultId}/files?path=${encodeURIComponent(filePath)}&raw=true`

    return (
      <section
        aria-label="Binärdatei-Ansicht"
        style={{ padding: '1rem', textAlign: 'center' }}
      >
        <img
          src={src}
          alt={fileName}
          onError={() => setImageError(true)}
          style={{ maxWidth: '100%', height: 'auto', display: 'inline-block' }}
        />
      </section>
    )
  }

  // Req 7.4: Unsupported binary format notice
  return (
    <section
      aria-label="Binärdatei-Ansicht"
      style={{ padding: '2rem', textAlign: 'center' }}
    >
      <p role="status" style={{ color: '#888', fontSize: '0.95rem' }}>
        Datei „{fileName}" ({normalizedExtension || 'unbekannter Typ'}) kann nicht angezeigt werden.
      </p>
    </section>
  )
}
