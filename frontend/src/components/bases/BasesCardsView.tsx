/**
 * BasesCardsView — the Obsidian `cards` layout: a responsive grid of cards, one
 * per note, with an optional cover image.
 *
 * View settings (all optional, Obsidian keys): `image` (property holding the
 * image — a `[[attachment]]` link, an http(s) URL or a `#hex` colour),
 * `imageFit` (`cover` crops, `contain` does not), `imageAspectRatio`
 * (width / height, default 1) and `cardSize` (card width in px, default 200).
 *
 * A `cards` view WITH `groupBy` keeps rendering as the Kanban board (the
 * historic Slatebase behaviour) — see `BasesView`; this component handles the
 * ungrouped case.
 */

import { memo, useCallback, useContext, useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { formatFormulaValue, evaluateFormulaColumn } from '@slatebase/shared-contracts'
import type { FormulaValue } from '@slatebase/shared-contracts'
import { AppContext } from '../../state'
import { resolveWikilinkTarget } from '../../plugins/link-resolver'
import { useCardContextMenu } from './base-card-menu'
import { parseCardImage, vaultImageSrc } from './cardImage'
import type { CardImage } from './cardImage'
import { formulaKeyOf } from './base-numeric-columns'
import { BaseFormulaValue } from './BaseFormulaValue'
import { CARD_RATIO, CARD_SIZE, clampTo, columnLabel as baseColumnLabel } from './base-edit'

export interface BasesCardsViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  vaultId: string
  readOnly?: boolean
  onOpenNote: (path: string) => void
}

function firstValue(row: BaseRow, key: string): string {
  if (key === 'file.name') return row.fileName
  const v = row.values[key.startsWith('note.') ? key.slice('note.'.length) : key]
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (v === undefined || v === null) return ''
  return String(v)
}

export const BasesCardsView = memo(function BasesCardsView({ doc, view, rows, vaultId, readOnly, onOpenNote }: BasesCardsViewProps) {
  const { openMenu, menu: cardMenu } = useCardContextMenu(vaultId, onOpenNote, readOnly)
  const tree = useContext(AppContext)?.state.directoryTree ?? null
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])

  const detailColumns = useMemo(() => {
    const configured = view.order ?? Object.keys(doc.properties ?? {})
    return configured.filter((c) => c !== 'file.name' && c !== view.image)
  }, [view.order, view.image, doc.properties])

  const columnLabel = useCallback((col: string) => baseColumnLabel(doc, col), [doc])

  // A formula column (`formula.x` or the bare id) is evaluated per row; `undefined` for any other column.
  const formulaValue = useCallback(
    (row: BaseRow, col: string): FormulaValue | undefined => {
      const key = formulaKeyOf(col, formulaKeys)
      if (key === null) return undefined
      const result = evaluateFormulaColumn(doc, row, key)
      return result.ok ? result.value : '#ERR'
    },
    [formulaKeys, doc],
  )

  const cellText = useCallback(
    (row: BaseRow, col: string): string => {
      const value = formulaValue(row, col)
      return value !== undefined ? formatFormulaValue(value) : firstValue(row, col)
    },
    [formulaValue],
  )

  // `file.file` is the note itself: the card shows it when it is an image.
  const imageFor = useCallback(
    (row: BaseRow): CardImage | null => {
      if (!view.image) return null
      if (view.image === 'file.file') return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(row.path) ? { kind: 'file', target: row.path } : null
      return parseCardImage(cellText(row, view.image))
    },
    [view.image, cellText],
  )

  const cardSize = (view.cardSize !== undefined ? clampTo(view.cardSize, CARD_SIZE.min, CARD_SIZE.max) : undefined) ?? CARD_SIZE.default
  const ratio = (view.imageAspectRatio !== undefined ? clampTo(view.imageAspectRatio, CARD_RATIO.min, CARD_RATIO.max) : undefined) ?? CARD_RATIO.default
  // Obsidian writes `contain` for "fit in"; a missing key is "fill". Tolerates a stray trailing comma.
  const fit = view.imageFit?.trim().startsWith('contain') ? 'contain' : 'cover'

  if (rows.length === 0) return <p className="bases-list__empty">Keine Einträge</p>

  const gridStyle = { '--bases-card-size': `${cardSize}px` } as CSSProperties

  return (
    <>
    <ul className="bases-cards" role="list" aria-label="Karten-Ansicht" style={gridStyle}>
      {rows.map((row) => {
        const image = imageFor(row)
        let cover: ReactNode = null
        if (image) {
          const coverStyle: CSSProperties = { aspectRatio: String(ratio) }
          if (image.kind === 'color') {
            cover = <div className="bases-cards__cover" style={{ ...coverStyle, background: image.color }} aria-hidden="true" />
          } else {
            const path = image.kind === 'file' ? resolveWikilinkTarget(image.target, tree, row.path) ?? image.target : null
            const src = image.kind === 'url' ? image.src : vaultImageSrc(vaultId, path!)
            cover = (
              <div className="bases-cards__cover" style={coverStyle}>
                <img src={src} alt="" loading="lazy" style={{ objectFit: fit }} />
              </div>
            )
          }
        }
        return (
          <li key={row.path} className="bases-cards__item">
            <button type="button" className="bases-cards__card" onClick={() => onOpenNote(row.path)} onContextMenu={(e) => openMenu(e, row.path)}>
              {cover}
              <span className="bases-cards__body">
                <span className="bases-list__title">{row.fileName}</span>
                {detailColumns.map((col) => {
                  const text = cellText(row, col)
                  const value = formulaValue(row, col)
                  return (
                    <span key={col} className={text ? 'bases-list__chip' : 'bases-list__chip bases-list__chip--empty'}>
                      <span className="bases-list__chip-key">{columnLabel(col)}</span>
                      <span className="bases-list__chip-val">
                        {!text ? '–' : value !== undefined ? <BaseFormulaValue value={value} vaultId={vaultId} sourcePath={row.path} /> : text}
                      </span>
                    </span>
                  )
                })}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
    {cardMenu}
    </>
  )
})
