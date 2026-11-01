import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { AvatarEditor, type AvatarValue } from './AvatarEditor'

afterEach(cleanup)

function value(overrides: Partial<AvatarValue> = {}): AvatarValue {
  return {
    avatarType: 'initials',
    avatarUrl: '',
    avatarColor: '',
    avatarData: '',
    avatarDicebear: '',
    ...overrides,
  }
}

describe('AvatarEditor', () => {
  it('renders a radiogroup with the four avatar types', () => {
    render(<AvatarEditor username="andreas" displayName="Andreas" value={value()} onChange={() => {}} />)
    const group = screen.getByRole('radiogroup')
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(4)
  })

  it('reports a type change via onChange', () => {
    const onChange = vi.fn()
    render(<AvatarEditor username="andreas" displayName="Andreas" value={value()} onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    // order: initials, dicebear, image, url
    fireEvent.click(radios[1]!)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ avatarType: 'dicebear' }))
  })

  it('reports a swatch colour selection on the initials panel', () => {
    const onChange = vi.fn()
    const { container } = render(
      <AvatarEditor username="andreas" displayName="Andreas" value={value()} onChange={onChange} />,
    )
    const swatch = container.querySelector('.avatar-editor__swatch') as HTMLButtonElement
    fireEvent.click(swatch)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ avatarColor: expect.stringMatching(/^#/) }))
  })

  it('reports a dicebear pick with a pinned api.dicebear.com URL', () => {
    const onChange = vi.fn()
    const { container } = render(
      <AvatarEditor username="andreas" displayName="Andreas" value={value({ avatarType: 'dicebear' })} onChange={onChange} />,
    )
    const item = container.querySelector('.avatar-editor__gallery-item') as HTMLButtonElement
    fireEvent.click(item)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarType: 'dicebear',
        avatarDicebear: expect.stringContaining('https://api.dicebear.com/'),
      }),
    )
  })

  it('shows a preview reflecting the current values', () => {
    const { container } = render(
      <AvatarEditor
        username="andreas"
        displayName="Andreas Müller"
        value={value({ avatarType: 'image', avatarData: 'data:image/png;base64,AAAA' })}
        onChange={() => {}}
      />,
    )
    const img = container.querySelector('.avatar-editor__preview img')
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })
}, 30000)
