import type {
  CategorizedConflictEntry,
  AutoResolutionConfig,
  AutoResolutionStrategy,
  ConflictResolutionAction,
} from './types.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Engine that evaluates auto-resolution strategies for categorized conflicts.
 * Pure function — no side effects, no I/O.
 */
export interface IAutoResolutionEngine {
  /**
   * Evaluates the auto-resolution strategy for a conflict.
   * Returns the resolution action or null if auto-resolution is disabled
   * or no strategy is configured for the conflict's category.
   */
  evaluate(conflict: CategorizedConflictEntry, config: AutoResolutionConfig): ConflictResolutionAction | null
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Applies the configured auto-resolution strategy to determine how a conflict
 * should be resolved without user intervention.
 */
export class AutoResolutionEngine implements IAutoResolutionEngine {
  /**
   * Evaluates the auto-resolution strategy for a categorized conflict.
   *
   * @param conflict - The categorized conflict entry to evaluate.
   * @param config - The auto-resolution configuration for the vault.
   * @returns The resolution action to apply, or null if no auto-resolution applies.
   */
  evaluate(conflict: CategorizedConflictEntry, config: AutoResolutionConfig): ConflictResolutionAction | null {
    if (!config.enabled) {
      return null
    }

    const strategy: AutoResolutionStrategy | undefined = config.strategies[conflict.category]
    if (strategy === undefined) {
      return null
    }

    return applyStrategy(strategy, conflict)
  }
}

// ─── Strategy Evaluation ─────────────────────────────────────────────────────

/**
 * Applies a specific auto-resolution strategy to a conflict.
 *
 * @param strategy - The strategy to apply.
 * @param conflict - The conflict entry with local/remote metadata.
 * @returns The determined resolution action.
 */
function applyStrategy(strategy: AutoResolutionStrategy, conflict: CategorizedConflictEntry): ConflictResolutionAction {
  switch (strategy) {
    case 'newer_wins':
      return evaluateNewerWins(conflict)
    case 'remote_wins':
      return { type: 'use_remote' }
    case 'local_wins':
      return { type: 'use_local' }
    case 'skip':
      return { type: 'skip' }
  }
}

/**
 * Evaluates the `newer_wins` strategy by comparing modification timestamps.
 * If timestamps are identical, falls back to `remote_wins`.
 *
 * @param conflict - The conflict entry containing local and remote modifiedAt ISO strings.
 * @returns `use_local` if local is newer, `use_remote` if remote is newer or timestamps are equal.
 */
function evaluateNewerWins(conflict: CategorizedConflictEntry): ConflictResolutionAction {
  const localTime = new Date(conflict.local.modifiedAt).getTime()
  const remoteTime = new Date(conflict.remote.modifiedAt).getTime()

  if (localTime > remoteTime) {
    return { type: 'use_local' }
  }

  // Remote is newer OR timestamps are identical → remote wins (fallback)
  return { type: 'use_remote' }
}
