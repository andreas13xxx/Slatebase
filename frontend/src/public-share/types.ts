/** One embed as the public reader receives it (mirrors backend `PublicEmbedView`). */
export type PublicEmbedView =
  | { kind: 'note'; markdown: string }
  | { kind: 'asset'; contentType: string }
  | { kind: 'unavailable' }

/** A shared note with its resolved embeds (mirrors backend `PublicNoteView`). */
export interface PublicNoteView {
  title: string
  /** Markdown without frontmatter. */
  markdown: string
  /** Embeds keyed by the reference as written in the note: `target`, `target#heading`, `target#^block`. */
  embeds: Record<string, PublicEmbedView>
}

/** A link as listed by the management routes (mirrors backend `PublicShareSummary`). */
export interface PublicShareSummary {
  id: string
  tokenHint: string
  vaultId: string
  filePath: string
  createdBy: string
  createdAt: string
  expiresAt?: string
  lastAccessAt?: string
  passwordProtected: boolean
}

/** Result of creating a link: the token is only available here. */
export interface CreatedPublicShare {
  share: PublicShareSummary
  token: string
  /** Path of the public page, e.g. `/s/<token>`. */
  path: string
}

/** One embed a link would include (sharing dialog preview). */
export interface EmbedPreviewEntry {
  ref: string
  kind: PublicEmbedView['kind']
}
