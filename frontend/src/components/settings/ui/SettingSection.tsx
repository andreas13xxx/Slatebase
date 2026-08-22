import type { ReactNode } from 'react'
import './SettingUI.css'

export interface SettingSectionProps {
  /** Card heading, rendered as h3. Omit for a card with no title (rare). */
  title?: string
  /** Optional explanatory text shown under the title. */
  description?: string
  /** Visual variant — danger tints the border for destructive sections. */
  variant?: 'default' | 'danger'
  children: ReactNode
  className?: string
}

/**
 * SettingSection — the single card container used across all settings tabs.
 * Groups related controls under one bordered surface with consistent spacing.
 */
export function SettingSection({ title, description, variant = 'default', children, className }: SettingSectionProps) {
  const classes = ['setting-section']
  if (variant === 'danger') classes.push('setting-section--danger')
  if (className) classes.push(className)

  return (
    <section className={classes.join(' ')}>
      {title !== undefined && <h3 className="setting-section__title">{title}</h3>}
      {description !== undefined && <p className="setting-section__description">{description}</p>}
      <div className="setting-section__body">{children}</div>
    </section>
  )
}
