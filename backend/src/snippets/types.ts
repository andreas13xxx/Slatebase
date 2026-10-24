// ─── CSS Snippet Types ────────────────────────────────────────────────────────

/** Metadata for a single stored CSS snippet. */
export interface SnippetMeta {
  /** Filename without the `.css` extension. */
  id: string;
  /** Full filename, e.g. `dark-accent.css`. */
  filename: string;
  /** Byte size of the CSS content. */
  size: number;
  /** ISO 8601 timestamp of the last write. */
  updatedAt: string;
}

/**
 * Activation status as exposed by the API. Backed by `enabledCssSnippets` in
 * `.obsidian/appearance.json`, which lists enabled snippets only: `updatedAt` is the
 * snippet file's modification time (empty if the file is gone).
 */
export interface SnippetRegistryData {
  version: 1;
  snippets: Record<string, {
    enabled: boolean;
    updatedAt: string;
  }>;
}

/**
 * Interface for the CSS snippet store. Snippets live in the vault's
 * `.obsidian/snippets/` folder, activation is `enabledCssSnippets` in
 * `.obsidian/appearance.json`. All methods take the vault's absolute path.
 */
export interface ISnippetStore {
  /** Save (create or overwrite) a snippet's CSS content. */
  saveSnippet(vaultPath: string, snippetId: string, content: string): Promise<void>;
  /** Load a snippet's CSS content. Returns null if it does not exist. */
  loadSnippet(vaultPath: string, snippetId: string): Promise<string | null>;
  /** Delete a snippet and remove it from the enabled list. Does nothing if it does not exist. */
  deleteSnippet(vaultPath: string, snippetId: string): Promise<void>;
  /** List metadata for all snippets in a vault. */
  listSnippets(vaultPath: string): Promise<SnippetMeta[]>;
  /** Ids of the enabled snippets (`enabledCssSnippets`). */
  loadEnabledIds(vaultPath: string): Promise<string[]>;
  /**
   * Replace the enabled snippets, preserving all other appearance.json fields.
   * @throws AppearanceFileInvalidError if the file exists but is not a JSON object.
   */
  saveEnabledIds(vaultPath: string, ids: string[]): Promise<void>;
}
