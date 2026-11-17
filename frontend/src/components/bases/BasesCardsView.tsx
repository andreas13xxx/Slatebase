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

import { memo, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { useCardContextMenu } from './base-card-menu'
import { useCardCovers } from './CardCover'
import { CARD_SIZE, clampTo, columnLabel as baseColumnLabel } from './base-edit'

export interface BasesCardsViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  vaultId: string
  readOnly?: boolean
  onOpenNote: (path: string) => void
}

export const BasesCardsView = memo(function BasesCardsView({ doc, view, rows, vaultId, readOnly, onOpenNote }: BasesCardsViewProps) {
  const { openMenu, menu: cardMenu } = useCardContextMenu(vaultId, onOpenNote, readOnly)
  const { cellText, coverFor } = useCardCovers(doc, view, vaultId)

  const detailColumns = useMemo(() => {
    const configured = view.order ?? Object.keys(doc.properties ?? {})
    return configured.filter((c) => c !== 'file.name' && c !== view.image)
  }, [view.order, view.image, doc.properties])

  const columnLabel = useCallback((col: string) => baseColumnLabel(doc, col), [doc])

  const cardSize = (view.cardSize !== undefined ? clampTo(view.cardSize, CARD_SIZE.min, CARD_SIZE.max) : undefined) ?? CARD_SIZE.default
  if (rows.length === 0) return <p className="bases-list__empty">Keine Einträge</p>

  const gridStyle = { '--bases-card-size': `${cardSize}px` } as CSSProperties

  return (
    <>
    <ul className="bases-cards" role="list" aria-label="Karten-Ansicht" style={gridStyle}>
      {rows.map((row) => {
        const cover = coverFor(row)
        return (
          <li key={row.path} className="bases-cards__item">
            <button type="button" className="bases-cards__card" onClick={() => onOpenNote(row.path)} onContextMenu={(e) => openMenu(e, row.path)}>
              {cover}
              <span className="bases-cards__body">
                <span className="bases-list__title">{row.fileName}</span>
                {detailColumns.map((col) => {
                  const text = cellText(row, col)
                  return (
                    <span key={col} className={text ? 'bases-list__chip' : 'bases-list__chip bases-list__chip--empty'}>
                      <span className="bases-list__chip-key">{columnLabel(col)}</span>
                      <span className="bases-list__chip-val">{text || '–'}</span>
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
