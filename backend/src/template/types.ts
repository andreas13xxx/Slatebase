// ─── Data Models ─────────────────────────────────────────────────────────────

/**
 * Information about a single template file available in a vault.
 */
export interface TemplateInfo {
  /** Display name (filename without `.md` extension). */
  name: string
  /** Relative path to the template file within the template directory. */
  path: string
}

// ─── Service Interface ───────────────────────────────────────────────────────

/**
 * Service for managing note templates.
 * Reads template files from a configurable directory and creates new files
 * with placeholder substitution.
 */
export interface ITemplateService {
  /** Lists available templates (alphabetically sorted, max 100). */
  listTemplates(vaultId: string): Promise<TemplateInfo[]>

  /** Creates a new file from a template with placeholder replacement. */
  createFromTemplate(
    vaultId: string,
    templateName: string,
    targetDir: string,
    fileName: string
  ): Promise<{ path: string; content: string }>
}
