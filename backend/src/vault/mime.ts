// Shared MIME type mapping from file extension.
//
// Used by the REST API (raw file responses, where a charset parameter matters
// for how browsers decode text) and by the MCP layer (resource/tool results,
// where binary payloads are base64 and a charset parameter is meaningless).

import path from 'node:path'

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
}

/**
 * Full Content-Type for a file, including the charset parameter for text
 * formats. Unknown extensions fall back to `application/octet-stream`.
 */
export function getContentTypeFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream'
}

/**
 * Bare media type for a file — same mapping as `getContentTypeFromExtension`
 * but without any parameters (`; charset=…`). Used where the payload carries
 * no charset of its own, e.g. base64-encoded MCP content blocks.
 */
export function getMediaTypeFromExtension(filePath: string): string {
  const contentType = getContentTypeFromExtension(filePath)
  const separator = contentType.indexOf(';')
  return separator === -1 ? contentType : contentType.slice(0, separator).trim()
}
