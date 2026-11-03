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
import { formatFormulaValue, evaluateFormula, rowContext } from '@slatebase/shared-contracts'
import { AppContext } from '../../state'
import { resolveWikilinkTarget } from '../../plugins/link-resolver'

export interface BasesCardsViewProps {
  doc: BaseDocument
  view: BaseView
  rows: BaseRow[]
  vaultId: string
  onOpenNote: (path: string) => void
}

const DEFAULT_CARD_SIZE = 200
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** What the cover area shows for one card. */
export type CardImage =
  | { kind: 'color'; color: string }
  | { kind: 'url'; src: string }
  | { kind: 'file'; target: string }

/** Classifies a raw image property value; null when there is nothing usable. */
export function parseCardImage(raw: string): CardImage | null {
  const value = raw.trim()
  if (!value) return null
  if (HEX_COLOR.test(value)) return { kind: 'color', color: value }
  const wiki = /^!?\[\[([^\]|#]+)/.exec(value)
  if (wiki) return { kind: 'file', target: wiki[1]!.trim() }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') return { kind: 'url', src: url.href }
    } catch {
      return null
    }
    return null
  }
  return { kind: 'file', target: value }
}

/** Vault file URL for an image path (same raw endpoint the note viewer uses). */
function vaultImageSrc(vaultId: string, path: string): string {
  return `/api/v1/vaults/${encodeURIComponent(vaultId)}/files?path=${encodeURIComponent(path)}&raw=true`
}

function firstValue(row: BaseRow, key: string): string {
  if (key === 'file.name') return row.fileName
  const v = row.values[key.startsWith('note.') ? key.slice('note.'.length) : key]
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  if (v === undefined || v === null) return ''
  return String(v)
}

export const BasesCardsView = memo(function BasesCardsView({ doc, view, rows, vaultId, onOpenNote }: BasesCardsViewProps) {
  const tree = useContext(AppContext)?.state.directoryTree ?? null
  const formulaKeys = useMemo(() => new Set(Object.keys(doc.formulas ?? {})), [doc.formulas])

  const detailColumns = useMemo(() => {
    const configured = view.order ?? Object.keys(doc.properties ?? {})
    return configured.filter((c) => c !== 'file.name' && c !== view.image)
  }, [view.order, view.image, doc.properties])

  const columnLabel = useCallback((col: string) => doc.properties?.[col]?.displayName ?? col, [doc.properties])

  const cellText = useCallback(
    (row: BaseRow, col: string): string => {
      if (formulaKeys.has(col)) {
        const result = evaluateFormula(doc.formulas?.[col] ?? '', rowContext(row))
        return result.ok ? formatFormulaValue(result.value) : '#ERR'
      }
      return firstValue(row, col)
    },
    [formulaKeys, doc],
  )

  const imageFor = useCallback(
    (row: BaseRow): CardImage | null => (view.image ? parseCardImage(cellText(row, view.image)) : null),
    [view.image, cellText],
  )

  const cardSize = view.cardSize && view.cardSize > 0 ? view.cardSize : DEFAULT_CARD_SIZE
  const ratio = view.imageAspectRatio && view.imageAspectRatio > 0 ? view.imageAspectRatio : 1
  const fit = view.imageFit === 'contain' ? 'contain' : 'cover'

  if (rows.length === 0) return <p className="bases-list__empty">Keine Einträge</p>

  const gridStyle = { '--bases-card-size': `${cardSize}px` } as CSSProperties

  return (
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
            <button type="button" className="bases-cards__card" onClick={() => onOpenNote(row.path)}>
              {cover}
              <span className="bases-cards__body">
                <span className="bases-list__title">{row.fileName}</span>
                {detailColumns.map((col) => {
                  const text = cellText(row, col)
                  if (!text) return null
                  return (
                    <span key={col} className="bases-list__chip">
                      <span className="bases-list__chip-key">{columnLabel(col)}</span>
                      <span className="bases-list__chip-val">{text}</span>
                    </span>
                  )
                })}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
})
