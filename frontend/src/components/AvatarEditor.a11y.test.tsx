import { describe, test, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
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

// useTranslation falls back to German without a provider, so no wrapper needed.
describe('AvatarEditor accessibility', () => {
  test('no axe violations for the initials panel', async () => {
    const { container } = render(
      <AvatarEditor username="andreas" displayName="Andreas" value={value()} onChange={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  test('no axe violations for the url panel', async () => {
    const { container } = render(
      <AvatarEditor username="andreas" displayName="Andreas" value={value({ avatarType: 'url' })} onChange={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  test('no axe violations for the dicebear gallery panel', async () => {
    const { container } = render(
      <AvatarEditor username="andreas" displayName="Andreas" value={value({ avatarType: 'dicebear' })} onChange={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  test('no axe violations for the image upload panel', async () => {
    const { container } = render(
      <AvatarEditor username="andreas" displayName="Andreas" value={value({ avatarType: 'image' })} onChange={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
}, 30000)
