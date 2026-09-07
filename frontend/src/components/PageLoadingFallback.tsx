/**
 * Suspense fallback for lazily-loaded pages/views (AP8 code-splitting).
 * Fills the available space of its (already-sized) container so swapping
 * it in/out never shifts surrounding layout.
 */
export function PageLoadingFallback() {
  return (
    <div className="page-loading-fallback" role="status" aria-live="polite">
      <span className="app-loading-spinner" aria-hidden="true" />
    </div>
  )
}
