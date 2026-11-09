/**
 * BasesFilterEditor — edits a `.base` filter tree: nested and / or / not groups
 * of conditions. A condition is a guided builder (property, operator, value)
 * when its expression can be split that way, otherwise the raw expression.
 */

import { memo, useCallback, useEffect, useState } from 'react'
import type { BaseDocument, BaseFilterNode, BaseRow } from '@slatebase/shared-contracts'
import {
  addFilterChild, childrenOf, conditionToExpression, groupKeyOf, parseCondition, removeFilterNode,
  OPERATOR_LABELS, replaceFilterNode, setGroupKey, VALUELESS_OPERATORS,
  type ColumnChoice, type Condition, type FilterGroupKey, type FilterPath, type Operator,
} from './base-edit'
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
  doc: BaseDocument
  rows: BaseRow[]
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (expression: string) => void
  onRemove: () => void
}

const ConditionRow = memo(function ConditionRow({ expression, doc, rows, columns, disabled, onChange, onRemove }: ConditionRowProps) {
  const parsed = parseCondition(expression)
  const [rawMode, setRawMode] = useState(parsed === null && expression !== '')
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
        onClick={() => setRawMode((v) => !v)}
      >
        {'</>'}
      </button>
      <button type="button" className="bases-tb__icon-btn" aria-label="Bedingung entfernen" title="Bedingung entfernen" disabled={disabled} onClick={onRemove}>×</button>
    </div>
  )
})

interface GroupEditorProps {
  node: BaseFilterNode
  path: FilterPath
  doc: BaseDocument
  rows: BaseRow[]
  columns: ColumnChoice[]
  disabled: boolean
  onChange: (update: RootUpdate) => void
}

const GroupEditor = memo(function GroupEditor({ node, path, doc, rows, columns, disabled, onChange }: GroupEditorProps) {
  const key = groupKeyOf(node)
  if (key === null) return null
  const children = childrenOf(node)
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
        return typeof child === 'string' ? (
          <ConditionRow
            key={i}
            expression={child}
            doc={doc}
            rows={rows}
            columns={columns}
            disabled={disabled}
            onChange={(expr) => onChange((r) => replaceFilterNode(r, childPath, expr))}
            onRemove={() => onChange((r) => removeFilterNode(r, childPath))}
          />
        ) : (
          <GroupEditor key={i} node={child} path={childPath} doc={doc} rows={rows} columns={columns} disabled={disabled} onChange={onChange} />
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
}

export const BasesFilterEditor = memo(function BasesFilterEditor({ root, doc, rows, columns, disabled, onChange }: BasesFilterEditorProps) {
  return <GroupEditor node={root} path={[]} doc={doc} rows={rows} columns={columns} disabled={disabled} onChange={onChange} />
})
