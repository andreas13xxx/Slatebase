import { useState, forwardRef, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '../i18n'
import './PasswordInput.css'

/**
 * Props for {@link PasswordInput}.
 *
 * Accepts every native `<input>` attribute except `type` (always a password
 * input) and `ref` (forwarded to the inner `<input>`). `className` is applied
 * to the inner `<input>` so existing per-field styling is preserved.
 */
export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * A password `<input>` with an integrated show/hide toggle button.
 *
 * The eye icon toggles the input between `type="password"` and `type="text"`.
 * The toggle is keyboard-operable, labelled for screen readers, and reflects
 * its state via `aria-pressed`. All other props (including `className`) pass
 * through to the inner `<input>`, so this is a drop-in replacement for a bare
 * `<input type="password">`.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...rest }, ref) {
    const { t } = useTranslation()
    const [visible, setVisible] = useState(false)

    const toggleLabel = visible ? t('auth.hidePassword') : t('auth.showPassword')

    return (
      <div className="password-input">
        <input
          {...rest}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={className ? `${className} password-input__field` : 'password-input__field'}
        />
        <button
          type="button"
          className="password-input__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={toggleLabel}
          aria-pressed={visible}
          title={toggleLabel}
          tabIndex={rest.disabled ? -1 : 0}
          disabled={rest.disabled}
        >
          {visible ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
        </button>
      </div>
    )
  },
)
