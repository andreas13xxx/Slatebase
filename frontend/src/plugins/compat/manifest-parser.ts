/**
 * Manifest parser for Obsidian plugin manifest.json files.
 *
 * Validates required fields, semver format, file size limits,
 * and provides compatibility checking against the emulated Obsidian API version.
 *
 * @module manifest-parser
 */

import { z } from 'zod';

/** Emulated Obsidian API version used for compatibility checks */
export const EMULATED_OBSIDIAN_VERSION = '1.4.0';

/** Maximum allowed manifest file size in bytes (1 MB) */
const DEFAULT_MAX_SIZE_BYTES = 1_048_576;

/** Semver regex: MAJOR.MINOR.PATCH where each segment is a non-negative integer */
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/**
 * Zod schema for validating Obsidian plugin manifests.
 * Uses passthrough() to preserve unknown fields for round-trip serialization.
 */
export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(SEMVER_REGEX),
  minAppVersion: z.string().regex(SEMVER_REGEX).optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  authorUrl: z.string().url().optional(),
  isDesktopOnly: z.boolean().optional(),
}).passthrough();

/** Inferred type from the Zod schema */
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/** Successful parse result including compatibility information */
export interface ManifestParseSuccess {
  success: true;
  manifest: PluginManifest;
  compatible: boolean;
  compatibilityWarning?: string;
}

/** Failed parse result with error details */
export interface ManifestParseError {
  success: false;
  error: {
    code: 'SIZE_EXCEEDED' | 'JSON_SYNTAX' | 'VALIDATION';
    message: string;
    field?: string;
    position?: { line: number; column: number };
  };
}

/** Discriminated union result type for manifest parsing */
export type ManifestParseResult = ManifestParseSuccess | ManifestParseError;

/** Options for parseManifest */
export interface ParseManifestOptions {
  maxSizeBytes?: number;
}

/**
 * Compare two semver strings numerically.
 *
 * @param a - First semver string (e.g. "1.4.0")
 * @param b - Second semver string (e.g. "1.5.0")
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const segA = partsA[i] ?? 0;
    const segB = partsB[i] ?? 0;
    if (segA < segB) return -1;
    if (segA > segB) return 1;
  }

  return 0;
}

/**
 * Determine the line and column of a JSON parse error from the error message.
 * Different engines report position differently, so we attempt multiple patterns.
 */
function extractJsonErrorPosition(errorMessage: string, jsonString: string): { line: number; column: number } | undefined {
  // V8/Node: "... at position 42"
  const positionMatch = errorMessage.match(/at position (\d+)/);
  if (positionMatch) {
    const offset = parseInt(positionMatch[1]!, 10);
    return offsetToLineColumn(jsonString, offset);
  }

  // Firefox: "... at line 3 column 5"
  const lineColMatch = errorMessage.match(/at line (\d+) column (\d+)/);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1]!, 10),
      column: parseInt(lineColMatch[2]!, 10),
    };
  }

  return undefined;
}

/**
 * Convert a character offset to line and column numbers.
 */
function offsetToLineColumn(str: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < offset && i < str.length; i++) {
    if (str[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }

  const column = offset - lastNewline;
  return { line, column };
}

/**
 * Parse and validate an Obsidian plugin manifest JSON string.
 *
 * Performs the following checks in order:
 * 1. File size validation (rejects > maxSizeBytes, default 1 MB)
 * 2. JSON syntax validation (reports position on error)
 * 3. Zod schema validation (required fields, semver format)
 * 4. Compatibility check (minAppVersion vs emulated version)
 *
 * @param jsonString - Raw JSON string content of manifest.json
 * @param options - Optional configuration (maxSizeBytes)
 * @returns ManifestParseResult — either success with manifest + compatibility info, or error with details
 */
export function parseManifest(jsonString: string, options?: ParseManifestOptions): ManifestParseResult {
  const maxSize = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

  // R1.6: Reject files > 1 MB
  const byteLength = new TextEncoder().encode(jsonString).length;
  if (byteLength > maxSize) {
    return {
      success: false,
      error: {
        code: 'SIZE_EXCEEDED',
        message: `Manifest file exceeds maximum size of ${maxSize} bytes (actual: ${byteLength} bytes)`,
      },
    };
  }

  // R1.5: Parse JSON, report syntax errors with position
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const position = extractJsonErrorPosition(errorMessage, jsonString);
    return {
      success: false,
      error: {
        code: 'JSON_SYNTAX',
        message: `Invalid JSON: ${errorMessage}`,
        position,
      },
    };
  }

  // R1.1, R1.2, R1.7: Validate with Zod schema
  const result = pluginManifestSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue?.path[0]?.toString() ?? 'unknown';
    let message: string;

    if (field === 'id' || field === 'name' || field === 'version') {
      // Determine if it's a missing/empty field or format error
      const rawObj = parsed as Record<string, unknown>;
      const rawValue = rawObj[field];

      if (rawValue === undefined || rawValue === null) {
        message = `Required field "${field}" is missing`;
      } else if (rawValue === '') {
        message = `Required field "${field}" must not be empty`;
      } else if (field === 'version') {
        message = `Invalid version format "${String(rawValue)}" — expected MAJOR.MINOR.PATCH`;
      } else {
        message = `Validation failed for field "${field}": ${firstIssue?.message ?? 'invalid value'}`;
      }
    } else if (field === 'version' || field === 'minAppVersion') {
      const rawObj = parsed as Record<string, unknown>;
      const rawValue = rawObj[field];
      message = `Invalid version format "${String(rawValue)}" — expected MAJOR.MINOR.PATCH`;
    } else {
      message = `Validation failed for field "${field}": ${firstIssue?.message ?? 'invalid value'}`;
    }

    return {
      success: false,
      error: {
        code: 'VALIDATION',
        message,
        field,
      },
    };
  }

  const manifest = result.data;

  // R1.3: Check minAppVersion compatibility
  let compatible = true;
  let compatibilityWarning: string | undefined;

  if (manifest.minAppVersion) {
    const cmp = compareSemver(EMULATED_OBSIDIAN_VERSION, manifest.minAppVersion);
    if (cmp < 0) {
      compatible = false;
      compatibilityWarning =
        `Plugin "${manifest.id}" requires Obsidian API version ${manifest.minAppVersion}, ` +
        `but emulated version is ${EMULATED_OBSIDIAN_VERSION}`;
    }
  }

  return {
    success: true,
    manifest,
    compatible,
    compatibilityWarning,
  };
}
