/**
 * BasesFilterEditor — edits a `.base` filter tree: nested and / or / not groups
 * of conditions. A condition is a guided builder (property, operator, value)
 * when its expression can be split that way, otherwise the raw expression.
 */

import { memo, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { BaseDocument, BaseFilterNode, BaseRow } from '@slatebase/shared-contracts'
import {
  addFilterChild, childrenOf, conditionToExpression, groupKeyOf, parseCondition, removeFilterNode,
  OPERATOR_LABELS, replaceFilterNode, setGroupKey, VALUELESS_OPERATORS,
  type ColumnChoice, type Condition, type FilterGroupKey, type FilterPath, type Operator,
} from './base-edit'
import { moveFilterNode, nudgeFilterNode } from './base-filter-tree'
import { ColumnDropdown } from './base-column-dropdown'

const GROUP_LABELS: Record<FilterGroupKey, string> = {
  and: 'Alle Bedingungen treffen zu',
  or: 'Mindestens eine Bedingung trifft zu',
  not: 'Keine Bedingung trifft zu',
}

const DEFAULT_CONDITION: Condition = { property: 'file.name', operator: 'contains', value: '' }

/** A text input that commits on blur / Enter, so typing does not rewrite the file per keystroke. */
export const CommitInput = memo(function CommitInput({
  value, onCommit, label, placeholder, disabled, className,
}: {
  value: string
  onCommit: (value: string) => void
  label: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  // Follow external value changes (e.g. after the file round-trip) without an effect.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    setDraft(value)
  }
  const commit = useCallback(() => { if (draft !== value) onCommit(draft) }, [draft, value, onCommit])
  return (
    <input
      type="text"
      className={className ?? 'bases-tb__input'}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
    />
  )
})

interface ConditionRowProps {
  expression: string
  doc: BaseDocument
  rows: BaseRow[]
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (expression: string) => void
  onRemove: () => void
  /** Whether the user switched this row to the raw-expression editor. Owned by the group, so it follows the row when rows are reordered. */
  rawMode: boolean
  onRawModeChange: (raw: boolean) => void
}

const ConditionRow = memo(function ConditionRow({ expression, doc, rows, columns, disabled, onChange, onRemove, rawMode, onRawModeChange }: ConditionRowProps) {
  const parsed = parseCondition(expression)
  const condition = parsed ?? DEFAULT_CONDITION
  const emit = (next: Condition) => onChange(conditionToExpression(next))
  const fixedProperty = condition.operator === 'hasTag' || condition.operator === 'inFolder'

  return (
    <div className="bases-tb__condition">
      {rawMode || (parsed === null && expression !== '') ? (
        <CommitInput
          className="bases-tb__input bases-tb__input--grow"
          label="Filterausdruck"
          placeholder='z. B. status == "offen"'
          value={expression}
          disabled={disabled}
          onCommit={onChange}
        />
      ) : (
        <>
          <ColumnDropdown
            doc={doc}
            rows={rows}
            columns={columns}
            value={condition.property}
            label="Eigenschaft"
            disabled={disabled || fixedProperty}
            onChange={(property) => emit({ ...condition, property })}
          />
          <select
            className="bases-tb__select"
            aria-label="Operator"
            value={condition.operator}
            disabled={disabled}
            onChange={(e) => {
              const operator = e.target.value as Operator
              const property = operator === 'hasTag' ? 'file.tags' : operator === 'inFolder' ? 'file.folder' : condition.property
              emit({ ...condition, operator, property })
            }}
          >
            {(Object.keys(OPERATOR_LABELS) as Operator[]).map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
          </select>
          {!VALUELESS_OPERATORS.has(condition.operator) && (
            <CommitInput
              className="bases-tb__input bases-tb__input--grow"
              label="Wert"
              value={condition.value}
              disabled={disabled}
              onCommit={(value) => emit({ ...condition, value })}
            />
          )}
        </>
      )}
      <button
        type="button"
        className="bases-tb__icon-btn"
        title={rawMode ? 'Zurück zum Baukasten' : 'Als Ausdruck bearbeiten'}
        aria-label={rawMode ? 'Zurück zum Baukasten' : 'Als Ausdruck bearbeiten'}
        aria-pressed={rawMode}
        disabled={disabled || (rawMode && parsed === null && expression !== '')}
        onClick={() => onRawModeChange(!rawMode)}
      >
        {'</>'}
      </button>
      <button type="button" className="bases-tb__icon-btn" aria-label="Bedingung entfernen" title="Bedingung entfernen" disabled={disabled} onClick={onRemove}>×</button>
    </div>
  )
})

/** Moves a filter node to the other scope ("this view" ↔ "all views"). */
export interface ScopeMove {
  label: string
  onMove: (path: FilterPath) => void
}

interface GroupEditorProps {
  node: BaseFilterNode
  path: FilterPath
  doc: BaseDocument
  rows: BaseRow[]
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (update: RootUpdate) => void
  scopeMove?: ScopeMove
}

/** Pointer handlers of a row's grip: one drag works for mouse, pen and touch alike. */
interface GripHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLSpanElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLSpanElement>) => void
  onPointerCancel: () => void
}

/** Handle, up/down and scope-move controls of one row. Hidden while the base is read-only. */
function RowTools({ index, count, kind, scopeMove, path, onChange, grip }: {
  index: number
  count: number
  kind: 'Bedingung' | 'Gruppe'
  scopeMove?: ScopeMove
  path: FilterPath
  onChange: (update: RootUpdate) => void
  grip: GripHandlers
}) {
  return (
    <div className="bases-tb__row-tools">
      {count > 1 && (
        <>
          <span
            className="bases-tb__grip"
            title="Ziehen zum Umsortieren"
            aria-hidden="true"
            {...grip}
          >
            ⠿
          </span>
          <button type="button" className="bases-tb__icon-btn" aria-label={`${kind} nach oben`} title={`${kind} nach oben`} disabled={index === 0} onClick={() => onChange((r) => nudgeFilterNode(r, path, -1))}>↑</button>
          <button type="button" className="bases-tb__icon-btn" aria-label={`${kind} nach unten`} title={`${kind} nach unten`} disabled={index === count - 1} onClick={() => onChange((r) => nudgeFilterNode(r, path, 1))}>↓</button>
        </>
      )}
      {scopeMove && (
        <button type="button" className="bases-tb__icon-btn" aria-label={scopeMove.label} title={scopeMove.label} onClick={() => scopeMove.onMove(path)}>⇄</button>
      )}
    </div>
  )
}

const GroupEditor = memo(function GroupEditor({ node, path, doc, rows, columns, disabled, onChange, scopeMove }: GroupEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const rowEls = useRef<Array<HTMLDivElement | null>>([])
  // Expressions whose row is in raw-editor mode. Keyed by the expression (not the index) so the
  // mode follows a row when it is moved; an edit in raw mode carries the entry over to the new text.
  const [rawExpressions, setRawExpressions] = useState<ReadonlySet<string>>(() => new Set())
  const key = groupKeyOf(node)
  if (key === null) return null
  const children = childrenOf(node)
  const endDrag = () => { setDragIndex(null); setOverIndex(null) }
  // The row under the pointer (clamped to the first/last row), by the rows' own boxes.
  const rowIndexAt = (clientY: number): number => {
    const boxes = rowEls.current.slice(0, children.length)
    for (let k = 0; k < boxes.length; k++) {
      const rect = boxes[k]?.getBoundingClientRect()
      if (rect && clientY < rect.bottom) return k
    }
    return Math.max(0, children.length - 1)
  }
  const gripFor = (i: number): GripHandlers => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setDragIndex(i)
      setOverIndex(i)
    },
    onPointerMove: (e) => {
      if (dragIndex === null) return
      const over = rowIndexAt(e.clientY)
      if (over !== overIndex) setOverIndex(over)
    },
    onPointerUp: (e) => {
      if (dragIndex === null) return
      const from = dragIndex
      const to = rowIndexAt(e.clientY)
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      endDrag()
      if (from !== to) onChange((r) => moveFilterNode(r, [...path, from], to))
    },
    onPointerCancel: endDrag,
  })
  return (
    <div className={path.length === 0 ? 'bases-tb__group' : 'bases-tb__group bases-tb__group--nested'}>
      <div className="bases-tb__group-head">
        <select
          className="bases-tb__select"
          aria-label="Verknüpfung"
          value={key}
          disabled={disabled}
          onChange={(e) => { const key = e.target.value as FilterGroupKey; onChange((r) => setGroupKey(r, path, key)) }}
        >
          {(Object.keys(GROUP_LABELS) as FilterGroupKey[]).map((k) => <option key={k} value={k}>{GROUP_LABELS[k]}</option>)}
        </select>
        {path.length > 0 && (
          <button type="button" className="bases-tb__icon-btn" aria-label="Gruppe entfernen" title="Gruppe entfernen" disabled={disabled} onClick={() => onChange((r) => removeFilterNode(r, path))}>×</button>
        )}
      </div>
      {children.map((child, i) => {
        const childPath = [...path, i]
        const content = typeof child === 'string' ? (
          <ConditionRow
            expression={child}
            doc={doc}
            rows={rows}
            columns={columns}
            disabled={disabled}
            onChange={(expr) => {
              if (rawExpressions.has(child) && expr !== child) {
                setRawExpressions((prev) => { const next = new Set(prev); next.delete(child); next.add(expr); return next })
              }
              onChange((r) => replaceFilterNode(r, childPath, expr))
            }}
            onRemove={() => onChange((r) => removeFilterNode(r, childPath))}
            rawMode={rawExpressions.has(child)}
            onRawModeChange={(raw) => setRawExpressions((prev) => {
              const next = new Set(prev)
              if (raw) next.add(child)
              else next.delete(child)
              return next
            })}
          />
        ) : (
          <GroupEditor node={child} path={childPath} doc={doc} rows={rows} columns={columns} disabled={disabled} onChange={onChange} scopeMove={scopeMove} />
        )
        if (disabled) return <div key={i}>{content}</div>
        const dropClass = dragIndex !== null && overIndex === i && dragIndex !== i
          ? (dragIndex < i ? ' bases-tb__row--drop-after' : ' bases-tb__row--drop-before')
          : ''
        return (
          <div
            key={i}
            ref={(el) => { rowEls.current[i] = el }}
            className={`bases-tb__row-wrap${dragIndex === i ? ' bases-tb__row-wrap--dragging' : ''}${dropClass}`}
          >
            <RowTools
              index={i}
              count={children.length}
              kind={typeof child === 'string' ? 'Bedingung' : 'Gruppe'}
              scopeMove={scopeMove}
              path={childPath}
              onChange={onChange}
              grip={gripFor(i)}
            />
            <div className="bases-tb__row-content">{content}</div>
          </div>
        )
      })}
      {!disabled && (
        <div className="bases-tb__group-actions">
          <button type="button" className="bases-tb__link-btn" onClick={() => onChange((r) => addFilterChild(r, path, conditionToExpression(DEFAULT_CONDITION)))}>
            + Bedingung
          </button>
          <button type="button" className="bases-tb__link-btn" onClick={() => onChange((r) => addFilterChild(r, path, { and: [] }))}>
            + Gruppe
          </button>
        </div>
      )}
    </div>
  )
})

/** An edit of the root filter group, applied to the latest tree. */
export type RootUpdate = (root: BaseFilterNode) => BaseFilterNode

export interface BasesFilterEditorProps {
  /** Root group being edited (use `rootGroup()` for a missing filter). */
  root: BaseFilterNode
  doc: BaseDocument
  rows: BaseRow[]
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (update: RootUpdate) => void
  /** Offers "move to the other scope" on every row when given. */
  scopeMove?: ScopeMove
}

export const BasesFilterEditor = memo(function BasesFilterEditor({ root, doc, rows, columns, disabled, onChange, scopeMove }: BasesFilterEditorProps) {
  return <GroupEditor node={root} path={[]} doc={doc} rows={rows} columns={columns} disabled={disabled} onChange={onChange} scopeMove={scopeMove} />
})
