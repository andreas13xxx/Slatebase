import type { ReactNode } from 'react'
import './SettingUI.css'

export interface SettingRowProps {
  /** Row label. Rendered as a <label> when htmlFor is set, otherwise a plain span. */
  label: string
  /** id of the control this row's label describes, for a11y. */
  htmlFor?: string
  /** Optional helper text shown under the row. */
  hint?: string
  /** The control (checkbox, input, select, button, …) shown at the end of the row. */
  children: ReactNode
  /** Indents the row to show it belongs to the row above (e.g. sub-options of a toggle). */
  nested?: boolean
}

/**
 * SettingRow — a label + control line, the standard building block inside a SettingSection.
 */
export function SettingRow({ label, htmlFor, hint, children, nested = false }: SettingRowProps) {
  const classes = ['setting-row']
  if (nested) classes.push('setting-row--nested')

  return (
    <div className={classes.join(' ')}>
      <div className="setting-row__main">
        {htmlFor !== undefined ? (
          <label className="setting-row__label" htmlFor={htmlFor}>{label}</label>
        ) : (
          <span className="setting-row__label">{label}</span>
        )}
        <div className="setting-row__control">{children}</div>
      </div>
      {hint !== undefined && <p className="setting-row__hint">{hint}</p>}
    </div>
  )
}
