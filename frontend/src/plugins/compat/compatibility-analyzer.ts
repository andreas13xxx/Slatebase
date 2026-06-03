/**
 * CompatibilityAnalyzer — Static analysis of Obsidian plugin bundles.
 *
 * Pattern-matches Obsidian API accesses in bundle source code to determine
 * which API methods a plugin uses. Classifies each detected call as
 * supported/partial/unsupported and calculates an overall compatibility level.
 */

// ─── Interfaces ────────────────────────────────────────────────────────────────

/**
 * ICompatibilityAnalyzer — Interface for static compatibility analysis.
 */
export interface ICompatibilityAnalyzer {
  analyze(bundleSource: string): CompatibilityReport;
}

/**
 * CompatibilityReport — Result of a static compatibility analysis.
 */
export interface CompatibilityReport {
  level: 'full' | 'partial' | 'unsupported' | 'unknown';
  apiCalls: ApiCallClassification[];
  lifecycleCritical: ApiCallClassification[];
}

/**
 * ApiCallClassification — A single detected API call with its classification.
 */
export interface ApiCallClassification {
  method: string;
  classification: 'supported' | 'partial' | 'unsupported';
}

// ─── Classification Lookup Tables ──────────────────────────────────────────────

/** API methods that are fully emulated in Slatebase shims. */
const SUPPORTED_METHODS: ReadonlySet<string> = new Set([
  'vault.read',
  'vault.modify',
  'vault.create',
  'vault.delete',
  'vault.getAbstractFileByPath',
  'vault.getMarkdownFiles',
  'vault.getFiles',
  'vault.getName',
  'vault.on',
  'vault.off',
  'workspace.getActiveFile',
  'workspace.on',
  'workspace.off',
  'metadataCache.getFileCache',
  'metadataCache.getFirstLinkpathDest',
  'metadataCache.resolvedLinks',
  'metadataCache.on',
  'metadataCache.off',
  'plugins.getPlugin',
  'plugins.plugins',
  'plugins.enabledPlugins',
  // Lifecycle methods — fully supported by the PluginLoader
  'onload',
  'onunload',
  'Plugin.registerEvent',
]);

/** API methods that exist but provide limited functionality. */
const PARTIAL_METHODS: ReadonlySet<string> = new Set([
  'workspace.trigger',
  'vault.trigger',
]);

/**
 * Known unsupported workspace methods.
 * Any workspace/vault/metadataCache method not in supported or partial is also unsupported.
 */
export const UNSUPPORTED_METHODS: ReadonlySet<string> = new Set([
  'workspace.createLeafBySplit',
  'workspace.getLeaf',
  'workspace.setActiveLeaf',
  'workspace.getLeavesOfType',
  'workspace.getActiveViewOfType',
  'workspace.getActiveLeaf',
  'workspace.revealLeaf',
  'workspace.detachLeavesOfType',
  'workspace.getRightLeaf',
  'workspace.getLeftLeaf',
  'workspace.splitActiveLeaf',
  'workspace.openLinkText',
  'workspace.getUnpinnedLeaf',
  'workspace.iterateAllLeaves',
  'workspace.iterateRootLeaves',
]);

/**
 * Lifecycle-critical methods — if any of these are classified as unsupported,
 * the overall level becomes 'unsupported'.
 */
const LIFECYCLE_CRITICAL_METHODS: ReadonlySet<string> = new Set([
  'onload',
  'onunload',
  'Plugin.registerEvent',
  'vault.read',
  'vault.modify',
]);

/** Maximum analysis time in milliseconds (10 seconds). */
const ANALYSIS_TIMEOUT_MS = 10_000;

// ─── Regex Patterns for API Detection ──────────────────────────────────────────

/**
 * Pattern to detect Obsidian API accesses in source code.
 * Matches patterns like:
 * - this.app.vault.read
 * - this.app.workspace.getActiveFile
 * - this.app.metadataCache.getFileCache
 * - this.app.plugins.getPlugin
 * - app.vault.read (variable reference)
 * - .app.vault.read (chained access)
 *
 * Captures the namespace (vault/workspace/metadataCache/plugins) and method name.
 */
const API_ACCESS_PATTERN = /(?:this\.app|\.app|app)\.(vault|workspace|metadataCache|plugins)\.(\w+)/g;

/**
 * Pattern to detect lifecycle methods (onload, onunload).
 */
const LIFECYCLE_PATTERN = /(?:async\s+)?onload\s*\(|(?:async\s+)?onunload\s*\(/g;

/**
 * Pattern to detect Plugin.registerEvent usage.
 */
const REGISTER_EVENT_PATTERN = /\.registerEvent\s*\(/g;

// ─── Implementation ────────────────────────────────────────────────────────────

/**
 * Classify a detected API method call.
 */
function classifyMethod(method: string): 'supported' | 'partial' | 'unsupported' {
  if (SUPPORTED_METHODS.has(method)) {
    return 'supported';
  }
  if (PARTIAL_METHODS.has(method)) {
    return 'partial';
  }
  return 'unsupported';
}

/**
 * Detect API accesses in bundle source code using regex pattern matching.
 * Returns deduplicated list of method strings (e.g. "vault.read").
 */
function detectApiCalls(bundleSource: string): Set<string> {
  const detected = new Set<string>();

  // Detect namespace.method patterns
  let match: RegExpExecArray | null;
  API_ACCESS_PATTERN.lastIndex = 0;
  while ((match = API_ACCESS_PATTERN.exec(bundleSource)) !== null) {
    const namespace = match[1];
    const method = match[2];
    if (namespace && method) {
      detected.add(`${namespace}.${method}`);
    }
  }

  // Detect lifecycle methods
  LIFECYCLE_PATTERN.lastIndex = 0;
  if (LIFECYCLE_PATTERN.test(bundleSource)) {
    detected.add('onload');
    detected.add('onunload');
  }

  // Detect registerEvent
  REGISTER_EVENT_PATTERN.lastIndex = 0;
  if (REGISTER_EVENT_PATTERN.test(bundleSource)) {
    detected.add('Plugin.registerEvent');
  }

  return detected;
}

/**
 * Determine if the bundle source appears to be obfuscated.
 * Heuristics:
 * - Very long lines with no meaningful whitespace
 * - High ratio of non-alphanumeric characters
 * - No recognizable Obsidian API patterns despite large file size
 */
function isLikelyObfuscated(bundleSource: string): boolean {
  // Empty bundles → unknown
  if (bundleSource.trim().length === 0) {
    return true;
  }

  // Large file with no detectable API patterns is suspicious
  // but we don't mark it as obfuscated just for being large —
  // only if it has characteristics of obfuscated code
  const lines = bundleSource.split('\n');
  const avgLineLength = bundleSource.length / Math.max(lines.length, 1);

  // Obfuscation heuristic: very few lines (< 5) with very long average (> 5000 chars)
  // and a high ratio of punctuation
  if (lines.length < 5 && avgLineLength > 5000) {
    const alphanumericCount = (bundleSource.match(/[a-zA-Z0-9]/g) ?? []).length;
    const ratio = alphanumericCount / bundleSource.length;
    // Normal code has >60% alphanumeric; heavily obfuscated is often <40%
    if (ratio < 0.4) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate the overall compatibility level from classified API calls.
 *
 * Rules:
 * - `full`: all detected calls are 'supported'
 * - `partial`: at least one 'partial' or 'unsupported', but no lifecycle-critical method is 'unsupported'
 * - `unsupported`: at least one lifecycle-critical method is 'unsupported'
 * - `unknown`: analysis failed (obfuscated code, empty bundle, timeout)
 */
export function calculateLevel(apiCalls: ApiCallClassification[]): 'full' | 'partial' | 'unsupported' {
  if (apiCalls.length === 0) {
    return 'full';
  }

  let hasPartialOrUnsupported = false;
  let hasUnsupportedLifecycleCritical = false;

  for (const call of apiCalls) {
    if (call.classification === 'partial' || call.classification === 'unsupported') {
      hasPartialOrUnsupported = true;
    }
    if (call.classification === 'unsupported' && LIFECYCLE_CRITICAL_METHODS.has(call.method)) {
      hasUnsupportedLifecycleCritical = true;
    }
  }

  if (hasUnsupportedLifecycleCritical) {
    return 'unsupported';
  }
  if (hasPartialOrUnsupported) {
    return 'partial';
  }
  return 'full';
}

/**
 * CompatibilityAnalyzer — Analyzes plugin bundles for Obsidian API compatibility.
 *
 * Performs static analysis via regex pattern matching to detect API accesses,
 * classifies them against the Slatebase shim coverage, and calculates an
 * overall compatibility level.
 */
export class CompatibilityAnalyzer implements ICompatibilityAnalyzer {
  /**
   * Analyze a plugin bundle source for Obsidian API compatibility.
   *
   * @param bundleSource - The raw JavaScript source code of the plugin bundle
   * @returns CompatibilityReport with level, detected API calls, and lifecycle-critical calls
   */
  analyze(bundleSource: string): CompatibilityReport {
    const startTime = performance.now();

    // Handle empty/obfuscated bundles
    if (isLikelyObfuscated(bundleSource)) {
      return { level: 'unknown', apiCalls: [], lifecycleCritical: [] };
    }

    try {
      // Detect API accesses
      const detectedMethods = detectApiCalls(bundleSource);

      // Check timeout after detection phase
      if (performance.now() - startTime > ANALYSIS_TIMEOUT_MS) {
        return { level: 'unknown', apiCalls: [], lifecycleCritical: [] };
      }

      // Classify each detected method
      const apiCalls: ApiCallClassification[] = [];
      for (const method of detectedMethods) {
        apiCalls.push({
          method,
          classification: classifyMethod(method),
        });
      }

      // Check timeout after classification phase
      if (performance.now() - startTime > ANALYSIS_TIMEOUT_MS) {
        return { level: 'unknown', apiCalls: [], lifecycleCritical: [] };
      }

      // Extract lifecycle-critical calls
      const lifecycleCritical = apiCalls.filter(call => LIFECYCLE_CRITICAL_METHODS.has(call.method));

      // Calculate overall compatibility level
      const level = calculateLevel(apiCalls);

      return { level, apiCalls, lifecycleCritical };
    } catch {
      // Analysis failure → unknown
      return { level: 'unknown', apiCalls: [], lifecycleCritical: [] };
    }
  }
}
