/**
 * CompatibilityAnalyzer — Static analysis of Obsidian plugin bundles.
 *
 * Determines browser compatibility through a multi-layered approach:
 * 1. **Manifest-based check** (primary): `isDesktopOnly` from manifest.json
 *    - `isDesktopOnly: true` → immediately classified as 'unsupported'
 *    - `isDesktopOnly: false` or absent → proceed to deeper analysis
 * 2. **Node.js API detection**: Scans for require('fs'), require('net'), etc.
 *    - Presence of Node.js imports → 'unsupported' (cannot run in browser)
 * 3. **Obsidian API pattern matching**: Classifies API accesses against
 *    Slatebase shim coverage (supported/partial/unsupported)
 *
 * Rationale: Plugins that work on Obsidian Mobile (iOS/Android WebView)
 * are very likely browser-compatible, since Mobile also lacks Node.js access.
 * `isDesktopOnly: false` (or absent) is the strongest signal that a plugin
 * avoids platform-specific APIs.
 */

import type { PluginManifestData } from './types';

// ─── Interfaces ────────────────────────────────────────────────────────────────

/**
 * ICompatibilityAnalyzer — Interface for static compatibility analysis.
 */
export interface ICompatibilityAnalyzer {
  analyze(bundleSource: string, manifest?: PluginManifestData): CompatibilityReport;
}

/**
 * CompatibilityReport — Result of a static compatibility analysis.
 */
export interface CompatibilityReport {
  level: 'full' | 'partial' | 'unsupported' | 'unknown';
  apiCalls: ApiCallClassification[];
  lifecycleCritical: ApiCallClassification[];
  /** Node.js modules detected in the bundle (e.g. 'fs', 'child_process') */
  nodeModules: string[];
  /** Whether the plugin declares itself as desktop-only in manifest.json */
  isDesktopOnly: boolean;
  /** Human-readable reasons for the determined level */
  reasons: string[];
}

/**
 * ApiCallClassification — A single detected API call with its classification.
 */
export interface ApiCallClassification {
  method: string;
  classification: 'supported' | 'partial' | 'unsupported';
}

// ─── Node.js Module Detection ──────────────────────────────────────────────────

/**
 * Node.js built-in modules that indicate desktop-only functionality.
 * Plugins importing these cannot run in a browser environment.
 */
const NODE_BUILTIN_MODULES: ReadonlySet<string> = new Set([
  'fs', 'path', 'os', 'child_process', 'net', 'tls', 'http', 'https',
  'crypto', 'stream', 'dgram', 'dns', 'cluster', 'worker_threads',
  'vm', 'v8', 'perf_hooks', 'readline', 'zlib', 'buffer',
  'electron', 'original-fs',
]);

/**
 * Patterns to detect Node.js module usage in bundle source code.
 * Covers CommonJS require() and ESM import patterns.
 */
const NODE_REQUIRE_PATTERNS: readonly RegExp[] = [
  // require('fs'), require("path"), require('child_process')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require("node:fs"), require('node:path')
  /require\s*\(\s*['"]node:([^'"]+)['"]\s*\)/g,
  // import ... from 'fs', import ... from "electron"
  /(?:import|from)\s+['"]([^'"]+)['"]/g,
  // import('fs'), import("electron")
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Detect Node.js built-in module usage in bundle source.
 * Returns the set of detected module names.
 */
function detectNodeModules(bundleSource: string): Set<string> {
  const detected = new Set<string>();

  for (const pattern of NODE_REQUIRE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(bundleSource)) !== null) {
      const moduleName = match[1];
      if (!moduleName) continue;

      // Strip 'node:' prefix if present
      const cleanName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;

      if (NODE_BUILTIN_MODULES.has(cleanName)) {
        detected.add(cleanName);
      }
    }
  }

  return detected;
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
 * Performs a multi-layered analysis:
 * 1. Manifest check: `isDesktopOnly: true` → immediately 'unsupported'
 * 2. Node.js module detection: presence of Node.js imports → 'unsupported'
 * 3. Obsidian API pattern matching: classifies API accesses against shim coverage
 *
 * The key insight: plugins that run on Obsidian Mobile (isDesktopOnly: false)
 * are highly likely to be browser-compatible, since Mobile uses a WebView
 * without Node.js access — the same constraint as Slatebase.
 */
export class CompatibilityAnalyzer implements ICompatibilityAnalyzer {
  /**
   * Analyze a plugin bundle source for browser compatibility.
   *
   * @param bundleSource - The raw JavaScript source code of the plugin bundle
   * @param manifest - Optional plugin manifest for isDesktopOnly check
   * @returns CompatibilityReport with level, detected API calls, Node.js modules, and reasons
   */
  analyze(bundleSource: string, manifest?: PluginManifestData): CompatibilityReport {
    const startTime = performance.now();
    const reasons: string[] = [];
    const desktopOnly = manifest?.isDesktopOnly === true;

    // ── Layer 1: Manifest-based gate ────────────────────────────────────────
    if (desktopOnly) {
      reasons.push(
        'Plugin declares "isDesktopOnly": true in manifest.json — ' +
        'uses Node.js or Electron APIs that are not available in a browser environment'
      );
      return {
        level: 'unsupported',
        apiCalls: [],
        lifecycleCritical: [],
        nodeModules: [],
        isDesktopOnly: true,
        reasons,
      };
    }

    // ── Layer 2: Handle empty/obfuscated bundles ────────────────────────────
    if (isLikelyObfuscated(bundleSource)) {
      reasons.push('Bundle appears to be empty or heavily obfuscated — cannot determine compatibility');
      return {
        level: 'unknown',
        apiCalls: [],
        lifecycleCritical: [],
        nodeModules: [],
        isDesktopOnly: false,
        reasons,
      };
    }

    try {
      // ── Layer 3: Node.js module detection ───────────────────────────────────
      const nodeModules = detectNodeModules(bundleSource);

      if (performance.now() - startTime > ANALYSIS_TIMEOUT_MS) {
        reasons.push('Analysis timed out');
        return { level: 'unknown', apiCalls: [], lifecycleCritical: [], nodeModules: [...nodeModules], isDesktopOnly: false, reasons };
      }

      if (nodeModules.size > 0) {
        const moduleList = [...nodeModules].sort().join(', ');
        reasons.push(
          `Plugin imports Node.js built-in modules: ${moduleList} — ` +
          'these are not available in a browser environment'
        );
        return {
          level: 'unsupported',
          apiCalls: [],
          lifecycleCritical: [],
          nodeModules: [...nodeModules],
          isDesktopOnly: false,
          reasons,
        };
      }

      // ── Layer 4: Obsidian API pattern matching ──────────────────────────────
      const detectedMethods = detectApiCalls(bundleSource);

      if (performance.now() - startTime > ANALYSIS_TIMEOUT_MS) {
        reasons.push('Analysis timed out');
        return { level: 'unknown', apiCalls: [], lifecycleCritical: [], nodeModules: [], isDesktopOnly: false, reasons };
      }

      // Classify each detected method
      const apiCalls: ApiCallClassification[] = [];
      for (const method of detectedMethods) {
        apiCalls.push({
          method,
          classification: classifyMethod(method),
        });
      }

      if (performance.now() - startTime > ANALYSIS_TIMEOUT_MS) {
        reasons.push('Analysis timed out');
        return { level: 'unknown', apiCalls: [], lifecycleCritical: [], nodeModules: [], isDesktopOnly: false, reasons };
      }

      // Extract lifecycle-critical calls
      const lifecycleCritical = apiCalls.filter(call => LIFECYCLE_CRITICAL_METHODS.has(call.method));

      // Calculate overall compatibility level
      const level = calculateLevel(apiCalls);

      // Build human-readable reasons
      if (level === 'full') {
        if (!desktopOnly) {
          reasons.push('Plugin is mobile-compatible (isDesktopOnly is not set or false) — strong indicator for browser compatibility');
        }
        if (apiCalls.length === 0) {
          reasons.push('No Obsidian API accesses detected — plugin likely uses only standard DOM/Web APIs');
        } else {
          reasons.push('All detected Obsidian API accesses are fully emulated by Slatebase shims');
        }
      } else if (level === 'partial') {
        const unsupportedCalls = apiCalls.filter(c => c.classification === 'unsupported').map(c => c.method);
        const partialCalls = apiCalls.filter(c => c.classification === 'partial').map(c => c.method);
        if (unsupportedCalls.length > 0) {
          reasons.push(`Unsupported API methods detected: ${unsupportedCalls.join(', ')} — these may not function correctly`);
        }
        if (partialCalls.length > 0) {
          reasons.push(`Partially supported API methods detected: ${partialCalls.join(', ')} — limited functionality`);
        }
        if (!desktopOnly) {
          reasons.push('Plugin is mobile-compatible — core functionality likely works despite unsupported methods');
        }
      }

      return { level, apiCalls, lifecycleCritical, nodeModules: [], isDesktopOnly: false, reasons };
    } catch {
      // Analysis failure → unknown
      return {
        level: 'unknown',
        apiCalls: [],
        lifecycleCritical: [],
        nodeModules: [],
        isDesktopOnly: false,
        reasons: ['Analysis failed due to an unexpected error'],
      };
    }
  }
}
