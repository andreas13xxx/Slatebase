import { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'

/**
 * BinaryViewer displays binary file content.
 * For supported image formats (PNG, JPEG, JPG, GIF, AVIF, WebP, SVG):
 *   renders an <img> element with src pointing to the raw file endpoint.
 * For PDF files:
 *   renders an embedded <iframe> viewer.
 * For unsupported binary formats:
 *   shows a notice with filename and file type.
 * Handles image load errors with a fallback notice.
 */

export interface BinaryViewerProps {
  fileName: string
  fileExtension: string
  vaultId: string
  filePath: string
  token?: string
}

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpeg', '.jpg', '.gif', '.avif', '.webp', '.svg']

function isSupportedImage(extension: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension.toLowerCase())
}

function isPdf(extension: string): boolean {
  return extension.toLowerCase() === '.pdf'
}

export function BinaryViewer({ fileName, fileExtension, vaultId, filePath, token }: BinaryViewerProps) {
  const { t } = useTranslation()
  const [imageError, setImageError] = useState(false)

  const normalizedExtension = fileExtension.toLowerCase()
  const isImage = isSupportedImage(normalizedExtension)
  const isPdfFile = isPdf(normalizedExtension)

  // Build raw file URL
  let rawSrc = `/api/v1/vaults/${vaultId}/files?path=${encodeURIComponent(filePath)}&raw=true`
  if (token) {
    rawSrc += `&token=${encodeURIComponent(token)}`
  }

  // Image load error fallback
  if (isImage && imageError) {
    return (
      <section
        aria-label={t('common.error')}
        style={{ padding: '2rem', textAlign: 'center' }}
      >
        <p role="status" style={{ color: '#888', fontSize: '0.95rem' }}>
          {t('binaryViewer.imageLoadError', { name: fileName })}
        </p>
      </section>
    )
  }

  // Render image preview for supported formats
  if (isImage) {
    return (
      <section
        aria-label={fileName}
        style={{ padding: '1rem', textAlign: 'center' }}
      >
        <img
          src={rawSrc}
          alt={fileName}
          onError={() => setImageError(true)}
          style={{ maxWidth: '100%', height: 'auto', display: 'inline-block' }}
        />
      </section>
    )
  }

  // Render embedded PDF viewer using Blob URL for Firefox compatibility
  if (isPdfFile) {
    return (
      <PdfViewer rawSrc={rawSrc} fileName={fileName} />
    )
  }

  // Unsupported binary format notice
  return (
    <section
      aria-label={fileName}
      style={{ padding: '2rem', textAlign: 'center' }}
    >
      <p role="status" style={{ color: '#888', fontSize: '0.95rem' }}>
        {t('binaryViewer.unsupported', { name: fileName, type: normalizedExtension || '?' })}
      </p>
    </section>
  )
}

/**
 * PdfViewer fetches the PDF as a Blob and renders it via an <object> element.
 * Using <object type="application/pdf"> forces Firefox to use its built-in pdf.js
 * viewer regardless of the user's download preferences for PDF files.
 */
export function PdfViewer({ rawSrc, fileName }: { rawSrc: string; fileName: string }) {
  const { t } = useTranslation()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let revoked = false
    let url: string | undefined

    fetch(rawSrc)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        if (revoked) return
        const pdfBlob = new Blob([blob], { type: 'application/pdf' })
        url = URL.createObjectURL(pdfBlob)
        setBlobUrl(url)
      })
      .catch(() => {
        if (!revoked) setError(true)
      })

    return () => {
      revoked = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [rawSrc])

  if (error) {
    return (
      <section aria-label={fileName} style={{ padding: '2rem', textAlign: 'center' }}>
        <p role="status" style={{ color: '#888', fontSize: '0.95rem' }}>
          {t('binaryViewer.unsupported', { name: fileName, type: '.pdf' })}
        </p>
      </section>
    )
  }

  if (!blobUrl) {
    return (
      <section aria-label={fileName} style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: '0.95rem' }}>{t('common.loading')}</p>
      </section>
    )
  }

  return (
    <section
      aria-label={fileName}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px' }}
    >
      <object
        data={blobUrl}
        type="application/pdf"
        aria-label={fileName}
        style={{ flex: 1, width: '100%', minHeight: '500px' }}
      >
        <p style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
          {t('binaryViewer.unsupported', { name: fileName, type: '.pdf' })}
        </p>
      </object>
    </section>
  )
}
