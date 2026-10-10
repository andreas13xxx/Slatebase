import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PasswordInput } from './PasswordInput'

/**
 * The component calls useTranslation(), which falls back to German without a
 * provider — so the toggle labels resolve to the de.ts strings in these tests.
 */
describe('PasswordInput', () => {
  it('renders a password-type input by default', () => {
    render(<PasswordInput aria-label="pw" />)
    expect(screen.getByLabelText('pw')).toHaveAttribute('type', 'password')
  })

  it('toggles the input to text and back when the button is clicked', () => {
    render(<PasswordInput aria-label="pw" />)
    const input = screen.getByLabelText('pw')
    const toggle = screen.getByRole('button', { name: 'Passwort anzeigen' })

    expect(input).toHaveAttribute('type', 'password')
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')

    // Label flips to the hide variant once visible.
    const hideToggle = screen.getByRole('button', { name: 'Passwort verbergen' })
    fireEvent.click(hideToggle)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('reflects visibility state via aria-pressed', () => {
    render(<PasswordInput aria-label="pw" />)
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('passes className through to the inner input and keeps its own', () => {
    render(<PasswordInput aria-label="pw" className="login-input" />)
    const input = screen.getByLabelText('pw')
    expect(input).toHaveClass('login-input')
    expect(input).toHaveClass('password-input__field')
  })

  it('forwards arbitrary input props (value, maxLength, autoComplete)', () => {
    render(
      <PasswordInput
        aria-label="pw"
        value="secret"
        onChange={() => {}}
        maxLength={128}
        autoComplete="new-password"
      />,
    )
    const input = screen.getByLabelText('pw')
    expect(input).toHaveValue('secret')
    expect(input).toHaveAttribute('maxlength', '128')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
  })

  it('disables both the input and the toggle when disabled', () => {
    render(<PasswordInput aria-label="pw" disabled />)
    expect(screen.getByLabelText('pw')).toBeDisabled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is a submit-safe button (type="button") so it never submits a form', () => {
    render(<PasswordInput aria-label="pw" />)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
