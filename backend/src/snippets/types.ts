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
 * Registry data model for `_registry.json`.
 * Stores activation status per snippet.
 */
export interface SnippetRegistryData {
  version: 1;
  snippets: Record<string, {
    enabled: boolean;
    updatedAt: string;
  }>;
}

/**
 * Interface for the CSS snippet filesystem store.
 * Manages snippet files and their activation registry, per vault.
 */
export interface ISnippetStore {
  /** Save (create or overwrite) a snippet's CSS content. */
  saveSnippet(vaultId: string, snippetId: string, content: string): Promise<void>;
  /** Load a snippet's CSS content. Returns null if it does not exist. */
  loadSnippet(vaultId: string, snippetId: string): Promise<string | null>;
  /** Delete a snippet. Does nothing if it does not exist. */
  deleteSnippet(vaultId: string, snippetId: string): Promise<void>;
  /** List metadata for all snippets in a vault. */
  listSnippets(vaultId: string): Promise<SnippetMeta[]>;
  /** Save the snippet activation registry for a vault. */
  saveRegistry(vaultId: string, registry: SnippetRegistryData): Promise<void>;
  /** Load the snippet activation registry for a vault. Returns null if it does not exist. */
  loadRegistry(vaultId: string): Promise<SnippetRegistryData | null>;
  /** Delete all snippet data for a vault (files + registry). */
  deleteAllForVault(vaultId: string): Promise<void>;
}
