/**
 * BasesViewOptionsDialog — the per-view settings window behind the gear button
 * in the view menu. It always offers the view's name and type, and — for a view
 * type a plugin contributed via `registerBasesView({ options })` — renders the
 * plugin's declared option controls (toggle, text, dropdown, slider, property, …).
 *
 * Option values are written into the `.base` view through `setViewOption`, so they
 * round-trip in the file exactly where the plugin reads them back (`config.get(key)`).
 */

import { useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { BaseDocument, BaseView } from '@slatebase/shared-contracts'
import { getBasesViewRegistration } from '../../plugins/compat/bases-view-registry'
import { getViewOption, renameView, setViewOption, setViewType, type ColumnChoice } from './base-edit'

/** A plugin-declared option or option group (subset of Obsidian's `BasesAllOptions`). */
interface OptionDef {
  key?: string
  type: string
  displayName?: string
  default?: unknown
  placeholder?: string
  options?: Record<string, string>
  items?: OptionDef[]
  min?: number
  max?: number
  step?: number
  shouldHide?: () => boolean
}

interface ConfigLike {
  setViewData?(key: string, value: unknown): void
  getViewData?(key: string): unknown
  name?: string
}

export interface BasesViewOptionsDialogProps {
  doc: BaseDocument
  index: number
  columns: ColumnChoice[]
  typeOptions: Array<{ id: string; label: string }>
  disabled: boolean
  onChange: (update: (doc: BaseDocument) => BaseDocument) => void
  onClose: () => void
}

/** Builds the `BasesViewConfig` a plugin's `options(config)` callback expects, seeded from the view. */
function buildConfig(view: BaseView): ConfigLike {
  const Ctor = window.obsidian?.['BasesViewConfig'] as unknown as (new () => ConfigLike) | undefined
  const config: ConfigLike = Ctor ? new Ctor() : {}
  config.name = view.name ?? view.type
  const seed: Record<string, unknown> = { ...(view._unknown ?? {}) }
  for (const key of ['limit', 'image', 'imageFit', 'imageAspectRatio', 'cardSize', 'columnWidth'] as const) {
    if (view[key] !== undefined) seed[key] = view[key]
  }
  for (const [k, v] of Object.entries(seed)) config.setViewData?.(k, v)
  return config
}

/** Plugin option definitions for a view, evaluated against a config seeded from it. */
function readOptionDefs(view: BaseView, config: ConfigLike): OptionDef[] {
  const factory = getBasesViewRegistration(view.type)?.options
  if (typeof factory !== 'function') return []
  try {
    const defs = factory(config)
    return Array.isArray(defs) ? (defs as OptionDef[]) : []
  } catch (err: unknown) {
    console.warn('[Bases] A plugin view options() callback threw:', err)
    return []
  }
}

function isHidden(def: OptionDef): boolean {
  try { return def.shouldHide?.() === true } catch { return false }
}

/**
 * Modal with the settings of one view. Rendered by `BasesToolbar` (not by the
 * view menu popover, which closes on outside clicks and would unmount it).
 */
export function BasesViewOptionsDialog({ doc, index, columns, typeOptions, disabled, onChange, onClose }: BasesViewOptionsDialogProps) {
  const { t } = useTranslation()
  const ref = useFocusTrap<HTMLDivElement>({ isActive: true, onEscape: onClose, returnFocusOnDeactivate: true })
  const view = doc.views[index]
  // One config per opened dialog (the parent remounts it per view/type), kept in
  // sync with each edit so plugin `shouldHide` callbacks see current values.
  const [config] = useState<ConfigLike>(() => (view ? buildConfig(view) : {}))
  const [, bump] = useState(0)
  const defs = useMemo(() => (view ? readOptionDefs(view, config) : []), [view, config])

  if (!view) return null

  const setOption = (key: string, value: unknown) => {
    config.setViewData?.(key, value)
    onChange((d) => setViewOption(d, index, key, value))
    bump((n) => n + 1)
  }

  const currentOf = (def: OptionDef): unknown => {
    const stored = def.key ? getViewOption(view, def.key) : undefined
    return stored !== undefined ? stored : def.default
  }

  const renderOption = (def: OptionDef, path: string): React.ReactNode => {
    if (isHidden(def)) return null
    if (def.type === 'group') {
      return (
        <fieldset key={path} className="bases-opts__group">
          <legend>{def.displayName}</legend>
          {(def.items ?? []).map((item, i) => renderOption(item, `${path}.${i}`))}
        </fieldset>
      )
    }
    const key = def.key
    if (!key) return null
    const id = `bases-opt-${path}`
    const value = currentOf(def)
    let control: React.ReactNode
    switch (def.type) {
      case 'toggle':
        control = <input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => setOption(key, e.target.checked)} />
        break
      case 'dropdown':
        control = (
          <select id={id} className="bases-tb__select" value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(e) => setOption(key, e.target.value)}>
            {!(typeof value === 'string' && value in (def.options ?? {})) && <option value="">{'—'}</option>}
            {Object.entries(def.options ?? {}).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        )
        break
      case 'slider':
        control = (
          <input
            id={id}
            type="range"
            min={def.min ?? 0}
            max={def.max ?? 100}
            step={def.step ?? 1}
            value={typeof value === 'number' ? value : (def.min ?? 0)}
            disabled={disabled}
            onChange={(e) => setOption(key, Number(e.target.value))}
          />
        )
        break
      case 'property':
        control = (
          <select id={id} className="bases-tb__select" value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(e) => setOption(key, e.target.value === '' ? undefined : e.target.value)}>
            <option value="">{def.placeholder ?? '—'}</option>
            {typeof value === 'string' && value !== '' && !columns.some((c) => c.id === value) && <option value={value}>{value}</option>}
            {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )
        break
      case 'multitext':
        control = (
          <textarea
            id={id}
            className="bases-tb__input"
            rows={3}
            value={Array.isArray(value) ? value.join('\n') : ''}
            disabled={disabled}
            onChange={(e) => setOption(key, e.target.value.split('\n').filter((l) => l.trim() !== ''))}
          />
        )
        break
      default:
        // text, formula, file, folder — a plain text field is the honest fallback for each.
        control = (
          <input
            id={id}
            type="text"
            className="bases-tb__input"
            placeholder={def.placeholder}
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            onChange={(e) => setOption(key, e.target.value === '' ? undefined : e.target.value)}
          />
        )
    }
    return (
      <div key={path} className="bases-opts__row">
        <label htmlFor={id}>{def.displayName ?? key}</label>
        {control}
      </div>
    )
  }

  const title = t('basesToolbar.viewOptionsTitle', { label: view.name ?? view.type })
  return (
    <div className="confirm-modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="confirm-modal bases-opts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bases-opts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bases-opts-title" className="confirm-modal-title">{title}</h2>
        <div className="bases-opts__body">
          <div className="bases-opts__row">
            <label htmlFor="bases-opt-name">{t('basesToolbar.viewName')}</label>
            <input
              id="bases-opt-name"
              type="text"
              className="bases-tb__input"
              defaultValue={view.name ?? ''}
              disabled={disabled}
              // Committed per keystroke, not on blur: closing with Escape unmounts the
              // field without a blur event, which would drop the pending rename.
              onChange={(e) => { const name = e.target.value; if (name.trim() !== '' && name.trim() !== (view.name ?? '')) onChange((d) => renameView(d, index, name)) }}
            />
          </div>
          <div className="bases-opts__row">
            <label htmlFor="bases-opt-type">{t('basesToolbar.viewType')}</label>
            <select id="bases-opt-type" className="bases-tb__select" value={view.type} disabled={disabled} onChange={(e) => { const type = e.target.value; onChange((d) => setViewType(d, index, type)) }}>
              {typeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          {defs.length > 0
            ? defs.map((def, i) => renderOption(def, String(i)))
            : <p className="bases-tb__hint">{t('basesToolbar.viewOptionsNone')}</p>}
        </div>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  )
}
