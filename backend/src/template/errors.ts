// ─── Template Error Classes ───────────────────────────────────────────────────

/**
 * Thrown when a template file cannot be found by name.
 */
export class TemplateNotFoundError extends Error {
  public readonly code = 'TEMPLATE_NOT_FOUND'

  constructor(public readonly templateName: string) {
    super(`Template not found: ${templateName}`)
    this.name = 'TemplateNotFoundError'
  }
}

/**
 * Thrown when a file created from a template would conflict with an existing file.
 */
export class TemplateConflictError extends Error {
  public readonly code = 'TEMPLATE_CONFLICT'

  constructor(public readonly targetPath: string) {
    super(`File already exists at target path: ${targetPath}`)
    this.name = 'TemplateConflictError'
  }
}
