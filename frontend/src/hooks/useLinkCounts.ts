/**
 * useLinkCounts — subscribes to the active document's forward/backlink
 * counts, published by App.tsx via linkCountsBridge.ts.
 */
import { useSyncExternalStore } from 'react'
import { getLinkCounts, subscribeLinkCounts, type LinkCounts } from '../state/linkCountsBridge'

export function useLinkCounts(): LinkCounts | null {
  return useSyncExternalStore(subscribeLinkCounts, getLinkCounts)
}
