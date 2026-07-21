import { vim } from '@replit/codemirror-vim'
import type { Extension } from '@codemirror/state'

/**
 * Creates a CM6 Vim mode extension.
 * Returns the vim extension when enabled, empty extension when disabled.
 * Designed to be used inside a Compartment for dynamic toggling.
 *
 * If the vim module fails to load (e.g. missing dependency), this module
 * will throw at import time — the caller (CodeMirrorEditor) should handle
 * this gracefully by catching and showing a toast notification.
 */
export function createVimModeExtension(enabled: boolean): Extension {
  if (!enabled) {
    return []
  }
  return vim()
}
