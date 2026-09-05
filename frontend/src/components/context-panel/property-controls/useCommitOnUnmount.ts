/**
 * Commits a still-open inline edit when the control unmounts.
 *
 * The property controls commit on blur — but React fires no blur event when an
 * input is unmounted, and unmounting mid-edit is routine here: every commit
 * rewrites the frontmatter block, which tears down and rebuilds the whole
 * properties editor (see FrontmatterWidget in
 * editor/live-preview/widget-decorations.ts), and toggling Live Preview does
 * the same. A value typed into one property and left uncommitted while
 * something else changed the document used to vanish without ever reaching the
 * document, so nothing was left to auto-save either.
 *
 * Two details matter:
 * - `flush` is read from a ref at unmount time, so the cleanup commits the
 *   latest draft rather than the one captured when the effect was set up.
 * - The commit is deferred by a microtask. Unmount can happen inside CM6's
 *   own update (or inside a React commit), and dispatching a transaction there
 *   is re-entrant. A microtask later, that work has unwound; and if the view is
 *   gone entirely by then, CM6 ignores the dispatch rather than misapplying it.
 *
 * Callers guard `flush` themselves — it must be a no-op unless an edit is
 * genuinely open and uncommitted, since an explicit commit sets state that may
 * not have re-rendered before the unmount arrives.
 */

import { useEffect, useRef } from 'react'

export function useCommitOnUnmount(flush: () => void): void {
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })

  useEffect(() => {
    return () => {
      const pending = flushRef.current
      queueMicrotask(pending)
    }
  }, [])
}
