import { createContext, useContext } from 'react'
import type { PublicEmbedView } from './types'

/**
 * Embeds of the shared note, keyed by embed reference. Provided by `PublicSharePage`; absent
 * everywhere else, in which case the reading view loads embedded notes through the API client.
 */
export const PublicEmbedContext = createContext<Record<string, PublicEmbedView> | null>(null)

/** The embeds of the surrounding public share, or `null` outside one. */
export function usePublicEmbeds(): Record<string, PublicEmbedView> | null {
  return useContext(PublicEmbedContext)
}
