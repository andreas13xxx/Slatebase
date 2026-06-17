// ─── Upload Error Classes ─────────────────────────────────────────────────────

/**
 * Thrown when an uploaded file exceeds the maximum allowed file size.
 */
export class UploadTooLargeError extends Error {
  public readonly code = 'UPLOAD_TOO_LARGE'

  constructor(public readonly fileName: string, public readonly maxBytes: number) {
    super(`File "${fileName}" exceeds maximum upload size of ${maxBytes} bytes`)
    this.name = 'UploadTooLargeError'
  }
}

/**
 * Thrown when the number of files in a single upload exceeds the allowed limit.
 */
export class UploadLimitExceededError extends Error {
  public readonly code = 'UPLOAD_LIMIT_EXCEEDED'

  constructor(public readonly fileCount: number, public readonly maxFiles: number) {
    super(`Upload contains ${fileCount} files, maximum allowed is ${maxFiles}`)
    this.name = 'UploadLimitExceededError'
  }
}
