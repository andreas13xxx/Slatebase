import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
}

/**
 * Button — the single button component used across all settings tabs.
 * Replaces the per-tab button class families (admin-config-btn, admin-users-btn, …).
 */
export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  const classes = ['st-btn', `st-btn--${variant}`]
  if (size === 'sm') classes.push('st-btn--sm')
  if (className) classes.push(className)

  return <button type={type} className={classes.join(' ')} {...rest} />
}
