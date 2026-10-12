import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PasswordInput } from './PasswordInput'

/**
 * The component calls useTranslation(), which falls back to German without a
 * provider. These tests therefore address the toggle by its stable role and
 * assert aria-pressed / aria-label *changes* rather than literal label copy,
 * so a wording edit in de.ts cannot break them.
 */
describe('PasswordInput', () => {
  it('renders a password-type input by default', () => {
    render(<PasswordInput aria-label="pw" />)
    expect(screen.getByLabelText('pw')).toHaveAttribute('type', 'password')
  })

  it('toggles the input to text and back when the button is clicked', () => {
    render(<PasswordInput aria-label="pw" />)
    const input = screen.getByLabelText('pw')
    const toggle = screen.getByRole('button')
    const showLabel = toggle.getAttribute('aria-label')

    expect(input).toHaveAttribute('type', 'password')
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'text')

    // The label flips to the hide variant once visible (asserted as a change,
    // not against literal copy, so a translation edit can't break this test).
    const hideLabel = toggle.getAttribute('aria-label')
    expect(hideLabel).not.toBe(showLabel)
    fireEvent.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-label', showLabel ?? '')
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
