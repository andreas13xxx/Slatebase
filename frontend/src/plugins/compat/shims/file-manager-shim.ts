/**
 * FileManagerShim — Obsidian-compatible FileManager API emulation.
 *
 * Provides:
 * - `renameFile(file, newPath)`: Rename/move a file and update all links
 * - `processFrontMatter(file, fn)`: Read/modify YAML frontmatter programmatically
 * - `generateMarkdownLink(file, sourcePath, subpath?, alias?)`: Generate a wikilink or markdown link
 *
 * Uses the VaultShim's rename/read/modify operations under the hood.
 *
 * @module file-manager-shim
 */

import type { DataWriteOptions, IVaultShim, TFile, TFolder } from '../types'
import { warnNoOp } from '../log'

/**
 * IFileManagerShim — Obsidian FileManager interface subset.
 */
export interface IFileManagerShim {
  /** Rename/move a file to a new path. Updates vault references. */
  renameFile(file: TFile, newPath: string): Promise<void>;
  /** Read and optionally modify the frontmatter of a markdown file. */
  processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void, options?: DataWriteOptions): Promise<void>;
  /** Generate a markdown link string to a file. */
  generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string;
  /** Get the default parent folder for new files. */
  getNewFileParent(sourcePath: string): TFolder;
  /** Create a new markdown file with the given name in the given folder. */
  createNewMarkdownFile(folder: TFolder, name: string): Promise<TFile>;
  /** Prompt user for deletion and delete the file (moves to trash). */
  promptForFileDeletion(file: TFile): Promise<void>;
  /** Move a file to trash (soft-delete). Used by LiveSync and other plugins. */
  trashFile(file: TFile): Promise<void>;
  /** Get an available path for an attachment file. */
  getAvailablePathForAttachment(filename: string, sourcePath?: string): Promise<string>;
}

/**
 * FileManagerShim — Implements Obsidian's FileManager API.
 *
 * Delegates to the VaultShim for actual file operations.
 */
export class FileManagerShim implements IFileManagerShim {
  private readonly vault: IVaultShim;

  constructor(vault: IVaultShim) {
    this.vault = vault;
  }

  /**
   * Rename/move a file to a new path.
   * Delegates to vault.rename() which handles the API call and event emission.
   *
   * In Obsidian, this also updates all links pointing to the renamed file.
   * In Slatebase, link updates are not automatic (plugins can listen to 'rename' event).
   */
  async renameFile(file: TFile, newPath: string): Promise<void> {
    await this.vault.rename(file, newPath);
  }

  /**
   * Read and optionally modify the YAML frontmatter of a markdown file.
   *
   * Reads the file content, parses the frontmatter section, calls the provided
   * function with the frontmatter object, then writes the modified content back.
   *
   * If the file has no frontmatter, an empty object is passed to the function.
   * If the function modifies the object, the file is updated with the new frontmatter.
   *
   * @param file - The markdown file to process
   * @param fn - Function that receives the frontmatter object. Modify it in place.
   * @param options - Obsidian 1.4.4+ write options, forwarded to vault.modify().
   *   Custom mtime/ctime are accepted but not persisted — see Vault.modify().
   */
  async processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void, options?: DataWriteOptions): Promise<void> {
    const content = await this.vault.read(file);

    const { frontmatter, body, hasFrontmatter } = parseFrontmatter(content);

    // Let the caller mutate the frontmatter object
    fn(frontmatter);

    // Serialize the frontmatter back to YAML
    const newFrontmatterStr = serializeFrontmatter(frontmatter);

    // Reconstruct the file content
    let newContent: string;
    if (Object.keys(frontmatter).length === 0 && !hasFrontmatter) {
      // No frontmatter was added and none existed before — keep original
      newContent = content;
    } else if (Object.keys(frontmatter).length === 0) {
      // Frontmatter was removed — strip the --- delimiters
      newContent = body;
    } else {
      newContent = `---\n${newFrontmatterStr}---\n${body}`;
    }

    // Only write if content actually changed
    if (newContent !== content) {
      await this.vault.modify(file, newContent, options);
    }
  }

  /**
   * Generate a markdown link or wikilink to a file.
   *
   * Obsidian uses the vault config "useMarkdownLinks" to decide format:
   * - Wikilinks (default): `[[filename]]` or `[[filename|alias]]` or `[[filename#heading]]`
   * - Markdown links: `[alias](path)` or `[filename](path#heading)`
   *
   * @param file - Target file
   * @param _sourcePath - Source file path (for relative path calculation, currently unused)
   * @param subpath - Optional heading/block reference (e.g. "#heading")
   * @param alias - Optional display text
   */
  generateMarkdownLink(file: TFile, _sourcePath: string, subpath?: string, alias?: string): string {
    const useMarkdownLinks = this.vault.getConfig('useMarkdownLinks') as boolean;
    const linkTarget = file.basename + (subpath ?? '');

    if (useMarkdownLinks) {
      const displayText = alias ?? file.basename;
      const encodedPath = file.path + (subpath ?? '');
      return `[${displayText}](${encodedPath})`;
    }

    // Wikilink format
    if (alias) {
      return `[[${linkTarget}|${alias}]]`;
    }
    return `[[${linkTarget}]]`;
  }

  /**
   * Get the default parent folder for new files.
   *
   * In Obsidian, this uses the "default location for new notes" setting.
   * In Slatebase, we return the vault root (path='') as the default.
   * If a sourcePath is given, we return its parent folder.
   */
  getNewFileParent(sourcePath: string): TFolder {
    if (sourcePath) {
      const lastSlash = sourcePath.lastIndexOf('/');
      if (lastSlash > 0) {
        const dirPath = sourcePath.slice(0, lastSlash);
        const dirName = dirPath.includes('/') ? dirPath.slice(dirPath.lastIndexOf('/') + 1) : dirPath;
        return {
          path: dirPath,
          name: dirName,
          children: [],
          parent: null,
          isRoot: () => false,
        };
      }
    }
    // Default: vault root
    return {
      path: '',
      name: '',
      children: [],
      parent: null,
      isRoot: () => true,
    };
  }

  /**
   * Create a new markdown file with the given name in the specified folder.
   *
   * Generates a unique filename if a file with the same name already exists
   * by appending a number suffix (e.g. "Note 1.md", "Note 2.md").
   *
   * @param folder - Target folder
   * @param name - Desired file name (without .md extension)
   * @returns The created TFile
   */
  async createNewMarkdownFile(folder: TFolder, name: string): Promise<TFile> {
    const baseName = name.endsWith('.md') ? name.slice(0, -3) : name;
    let filePath = folder.path ? `${folder.path}/${baseName}.md` : `${baseName}.md`;

    // Check if file already exists and generate unique name
    let attempt = 0;
    while (this.vault.getAbstractFileByPath(filePath) !== null) {
      attempt++;
      const uniqueName = `${baseName} ${attempt}`;
      filePath = folder.path ? `${folder.path}/${uniqueName}.md` : `${uniqueName}.md`;
    }

    return await this.vault.create(filePath, '');
  }

  /**
   * Prompt the user for file deletion, then delete the file.
   *
   * The prompt is the point of this method — a plugin calls it precisely when it
   * wants the user, not itself, to make the call. Deleting straight away (which
   * this used to do) turns a plugin's "ask before removing this" into an
   * unannounced deletion, and the trash being recoverable does not make that the
   * behaviour the plugin asked for.
   *
   * @param file - The file to delete
   */
  async promptForFileDeletion(file: TFile): Promise<void> {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`"${file.name}" löschen?`)) return;
    }
    await this.vault.delete(file);
  }

  /**
   * Move a file to trash (soft-delete).
   * Delegates to vault.trash() which uses the backend's soft-delete mechanism.
   */
  async trashFile(file: TFile): Promise<void> {
    await this.vault.trash(file);
  }

  /**
   * Prompt the user to rename a file. In Slatebase, just a no-op stub.
   * Plugins like Excalidraw call this for rename dialogs.
   */
  async promptForFileRename(_file: TFile): Promise<void> {
    warnNoOp('FileManager', 'promptForFileRename', 'No rename dialog is shown; the file is left unchanged.')
  }

  /**
   * Get an available (non-conflicting) path for an attachment file.
   * Delegates to the vault's getAvailablePathForAttachments helper.
   */
  async getAvailablePathForAttachment(filename: string, sourcePath?: string): Promise<string> {
    return (this.vault as unknown as { getAvailablePathForAttachments: (f: string, s?: string) => string })
      .getAvailablePathForAttachments(filename, sourcePath);
  }
}

// ─── Internal Frontmatter Helpers ──────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a markdown file's content.
 * Returns the parsed frontmatter object, the body (everything after frontmatter),
 * and whether frontmatter was originally present.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
} {
  // Frontmatter must start at the very beginning of the file with ---
  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  // Find the closing ---
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }

  const yamlStr = content.slice(4, endIndex); // Skip opening "---\n"
  const body = content.slice(endIndex + 4); // Skip closing "\n---"
  // Strip leading newline from body if present
  const cleanBody = body.startsWith('\n') ? body.slice(1) : body;

  // Parse simple YAML (key: value pairs, arrays)
  const frontmatter = parseSimpleYaml(yamlStr);

  return { frontmatter, body: cleanBody, hasFrontmatter: true };
}

/**
 * Parse simple YAML key-value pairs.
 * Handles: strings, numbers, booleans, null, simple arrays (- item), and inline arrays [a, b].
 * Does NOT handle nested objects or complex YAML.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Array item (continuation of previous key)
    if (line.match(/^\s+-\s+/) && currentKey !== null) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      if (currentArray === null) {
        currentArray = [];
      }
      currentArray.push(parseYamlValue(value));
      result[currentKey] = currentArray;
      continue;
    }

    // Key: value pair
    const match = line.match(/^(\w[\w\s-]*):\s*(.*)/);
    if (match) {
      // Save previous array if any
      currentKey = match[1]!.trim();
      currentArray = null;
      const rawValue = match[2]!.trim();

      if (rawValue === '') {
        // Could be followed by array items
        result[currentKey] = null;
      } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        // Inline array: [a, b, c]
        const items = rawValue.slice(1, -1).split(',').map(s => parseYamlValue(s.trim()));
        result[currentKey] = items;
        currentArray = items;
      } else {
        result[currentKey] = parseYamlValue(rawValue);
      }
    }
  }

  return result;
}

/**
 * Parse a single YAML scalar value.
 */
function parseYamlValue(value: string): unknown {
  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Null
  if (value === 'null' || value === '~') return null;
  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  // String
  return value;
}

/**
 * Serialize a frontmatter object back to YAML string.
 * Handles: strings, numbers, booleans, null, arrays.
 */
function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) {
      lines.push(`${key}:`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${serializeYamlValue(item)}`);
        }
      }
    } else {
      lines.push(`${key}: ${serializeYamlValue(value)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

/**
 * Serialize a single YAML scalar value.
 */
function serializeYamlValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Quote strings that contain special characters
    if (value.includes(':') || value.includes('#') || value.includes('\n') ||
        value.includes('"') || value.includes("'") || value.startsWith('[') ||
        value.startsWith('{') || value === '') {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}
