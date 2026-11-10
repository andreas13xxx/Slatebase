/**
 * BasesFilterEditor — edits a `.base` filter tree: nested and / or / not groups
 * of conditions. A condition is a guided builder (property, operator, value)
 * when its expression can be split that way, otherwise the raw expression.
 */

import { memo, useCallback, useEffect, useState, type DragEvent } from 'react'
import type { BaseFilterNode } from '@slatebase/shared-contracts'
import {
  addFilterChild, childrenOf, conditionToExpression, groupKeyOf, parseCondition, removeFilterNode,
  OPERATOR_LABELS, replaceFilterNode, setGroupKey, VALUELESS_OPERATORS,
  type ColumnChoice, type Condition, type FilterGroupKey, type FilterPath, type Operator,
} from './base-edit'
import { moveFilterNode, nudgeFilterNode } from './base-filter-tree'

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
  useEffect(() => setDraft(value), [value])
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
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (expression: string) => void
  onRemove: () => void
}

const ConditionRow = memo(function ConditionRow({ expression, columns, disabled, onChange, onRemove }: ConditionRowProps) {
  const parsed = parseCondition(expression)
  const [rawMode, setRawMode] = useState(parsed === null && expression !== '')
  const condition = parsed ?? DEFAULT_CONDITION
  const emit = (next: Condition) => onChange(conditionToExpression(next))
  const known = columns.some((c) => c.id === condition.property)
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
          <select
            className="bases-tb__select"
            aria-label="Eigenschaft"
            value={condition.property}
            disabled={disabled || fixedProperty}
            onChange={(e) => emit({ ...condition, property: e.target.value })}
          >
            {!known && <option value={condition.property}>{condition.property}</option>}
            {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
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
        onClick={() => setRawMode((v) => !v)}
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
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (update: RootUpdate) => void
  scopeMove?: ScopeMove
}

/** Handle, up/down and scope-move controls of one row. Hidden while the base is read-only. */
function RowTools({ index, count, kind, scopeMove, path, onChange, onDragStart, onDragEnd }: {
  index: number
  count: number
  kind: 'Bedingung' | 'Gruppe'
  scopeMove?: ScopeMove
  path: FilterPath
  onChange: (update: RootUpdate) => void
  onDragStart: (e: DragEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
}) {
  return (
    <div className="bases-tb__row-tools">
      {count > 1 && (
        <>
          <span
            className="bases-tb__grip"
            draggable
            title="Ziehen zum Umsortieren"
            aria-hidden="true"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
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

const GroupEditor = memo(function GroupEditor({ node, path, columns, disabled, onChange, scopeMove }: GroupEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const key = groupKeyOf(node)
  if (key === null) return null
  const children = childrenOf(node)
  const endDrag = () => { setDragIndex(null); setOverIndex(null) }
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
            columns={columns}
            disabled={disabled}
            onChange={(expr) => onChange((r) => replaceFilterNode(r, childPath, expr))}
            onRemove={() => onChange((r) => removeFilterNode(r, childPath))}
          />
        ) : (
          <GroupEditor node={child} path={childPath} columns={columns} disabled={disabled} onChange={onChange} scopeMove={scopeMove} />
        )
        if (disabled) return <div key={i}>{content}</div>
        const dropClass = dragIndex !== null && overIndex === i && dragIndex !== i
          ? (dragIndex < i ? ' bases-tb__row--drop-after' : ' bases-tb__row--drop-before')
          : ''
        return (
          <div
            key={i}
            className={`bases-tb__row-wrap${dragIndex === i ? ' bases-tb__row-wrap--dragging' : ''}${dropClass}`}
            onDragOver={dragIndex === null ? undefined : (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overIndex !== i) setOverIndex(i) }}
            onDrop={dragIndex === null ? undefined : (e) => {
              e.preventDefault()
              const from = dragIndex
              endDrag()
              if (from !== i) onChange((r) => moveFilterNode(r, [...path, from], i))
            }}
          >
            <RowTools
              index={i}
              count={children.length}
              kind={typeof child === 'string' ? 'Bedingung' : 'Gruppe'}
              scopeMove={scopeMove}
              path={childPath}
              onChange={onChange}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDragIndex(i) }}
              onDragEnd={endDrag}
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
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (update: RootUpdate) => void
  /** Offers "move to the other scope" on every row when given. */
  scopeMove?: ScopeMove
}

export const BasesFilterEditor = memo(function BasesFilterEditor({ root, columns, disabled, onChange, scopeMove }: BasesFilterEditorProps) {
  return <GroupEditor node={root} path={[]} columns={columns} disabled={disabled} onChange={onChange} scopeMove={scopeMove} />
})
