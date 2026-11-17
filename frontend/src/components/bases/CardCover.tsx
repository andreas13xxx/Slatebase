/**
 * Shared cover-image handling of the card layouts (gallery grid and Kanban board):
 * resolves the view's `image` property of a row to an element, honouring
 * `imageFit` and `imageAspectRatio`. One implementation so both layouts agree on
 * what an image value (attachment link, URL, `#hex` colour) means.
 */

import { useCallback, useContext, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { formatFormulaValue, evaluateFormula, rowContext } from '@slatebase/shared-contracts'
import { AppContext } from '../../state'
import { resolveWikilinkTarget } from '../../plugins/link-resolver'
import { parseCardImage } from './cardImage'
import type { CardImage } from './cardImage'
import { CARD_RATIO, clampTo } from './base-edit'

/** Vault file URL for an image path (same raw endpoint the note viewer uses). */
function vaultImageSrc(vaultId: string, path: string): string {
  return `/api/v1/vaults/${encodeURIComponent(vaultId)}/files?path=${encodeURIComponent(path)}&raw=true`
}

/** Display text of one cell: formula columns are evaluated, `file.name` is the file name. */
function rawCellText(row: BaseRow, col: string): string {
  if (col === 'file.name') return row.fileName
  const v = row.values[col.startsWith('note.') ? col.slice('note.'.length) : col]
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (v === undefined || v === null) return ''
  return String(v)
}

export interface CardCovers {
  /** Cell text as shown on a card (formula columns evaluated). */
  cellText: (row: BaseRow, col: string) => string
  /** The cover element of a row, or null when the view has no image property or the row has no usable image. */
  coverFor: (row: BaseRow) => ReactNode
}

/** Builds the cover renderer for a view. `vaultId` addresses attachment links. */
export function useCardCovers(doc: BaseDocument, view: BaseView, vaultId: string): CardCovers {
  const tree = useContext(AppContext)?.state.directoryTree ?? null
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])

  const cellText = useCallback(
    (row: BaseRow, col: string): string => {
      if (formulaKeys.has(col)) {
        const result = evaluateFormula(doc.formulas?.[col] ?? '', rowContext(row))
        return result.ok ? formatFormulaValue(result.value) : '#ERR'
      }
      return rawCellText(row, col)
    },
    [formulaKeys, doc],
  )

  const ratio = (view.imageAspectRatio !== undefined ? clampTo(view.imageAspectRatio, CARD_RATIO.min, CARD_RATIO.max) : undefined) ?? CARD_RATIO.default
  // Obsidian writes `contain` for "fit in"; a missing key is "fill". Tolerates a stray trailing comma.
  const fit = view.imageFit?.trim().startsWith('contain') ? 'contain' : 'cover'

  const imageFor = useCallback(
    (row: BaseRow): CardImage | null => {
      if (!view.image) return null
      // `file.file` is the note itself: the card shows it when it is an image.
      if (view.image === 'file.file') return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(row.path) ? { kind: 'file', target: row.path } : null
      return parseCardImage(cellText(row, view.image))
    },
    [view.image, cellText],
  )

  const coverFor = useCallback(
    (row: BaseRow): ReactNode => {
      const image = imageFor(row)
      if (!image) return null
      const coverStyle: CSSProperties = { aspectRatio: String(ratio) }
      if (image.kind === 'color') {
        return <div className="bases-cards__cover" style={{ ...coverStyle, background: image.color }} aria-hidden="true" />
      }
      const path = image.kind === 'file' ? resolveWikilinkTarget(image.target, tree, row.path) ?? image.target : null
      const src = image.kind === 'url' ? image.src : vaultImageSrc(vaultId, path!)
      return (
        <div className="bases-cards__cover" style={coverStyle}>
          <img src={src} alt="" loading="lazy" style={{ objectFit: fit }} />
        </div>
      )
    },
    [imageFor, ratio, fit, tree, vaultId],
  )

  return { cellText, coverFor }
}
