/**
 * Accent-insensitive search normalization. The implementation lives in
 * `@slatebase/shared-contracts` (`search-fold.ts`) so the backend search folds
 * text exactly like the frontend; this module keeps the local import path.
 */
export { foldForSearch, foldQuery, toOriginalRange, mergeRanges, mapFoldedMatches } from '@slatebase/shared-contracts'
export type { FoldedText } from '@slatebase/shared-contracts'
