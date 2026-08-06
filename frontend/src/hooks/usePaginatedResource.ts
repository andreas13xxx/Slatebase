import { useCallback, useEffect, useRef, useState } from 'react'
import { extractErrorMessage } from '../utils/error'

/** Shape a fetchPage() implementation must resolve to. */
export interface PaginatedResult<T> {
  items: T[]
  page: number
  totalPages: number
  total: number
}

/** Return value of usePaginatedResource. */
export interface UsePaginatedResourceResult<T> {
  items: T[]
  page: number
  totalPages: number
  total: number
  loading: boolean
  error: string | null
  /** Loads (or reloads) a specific page. */
  loadPage: (page: number) => void
  /** Reloads whichever page is currently shown — e.g. after a mutation. */
  reload: () => void
}

/**
 * Shared list-loading state machine for admin pages: call fetchPage(n),
 * track loading/error, expose loadPage()/reload(). Re-fetches page 1
 * automatically whenever fetchPage's identity changes (e.g. a caller whose
 * fetchPage depends on filter state, so changing a filter re-fetches from
 * page 1 with no extra code at the call site) — as well as once on mount.
 *
 * Pages that aren't server-paginated (e.g. "fetch everything") can still
 * use this: have fetchPage() ignore its page argument and always resolve
 * `{ page: 1, totalPages: 1 }`.
 */
export function usePaginatedResource<T>(
  fetchPage: (page: number) => Promise<PaginatedResult<T>>,
  errorFallback: string,
): UsePaginatedResourceResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useRef(1)

  const loadPage = useCallback((targetPage: number) => {
    pageRef.current = targetPage
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const result = await fetchPage(targetPage)
        setItems(result.items)
        setPage(result.page)
        setTotalPages(result.totalPages)
        setTotal(result.total)
      } catch (err: unknown) {
        setError(extractErrorMessage(err, errorFallback))
      } finally {
        setLoading(false)
      }
    })()
  }, [fetchPage, errorFallback])

  const reload = useCallback(() => {
    loadPage(pageRef.current)
  }, [loadPage])

  // Load page 1 on mount, and again whenever fetchPage's identity changes
  // (e.g. filter state it closes over changed) — resetting to page 1 in
  // that case is the desired behavior for a changed filter.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/filter-change, setState is async/deferred
    loadPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPage already depends on fetchPage
  }, [fetchPage])

  return { items, page, totalPages, total, loading, error, loadPage, reload }
}
