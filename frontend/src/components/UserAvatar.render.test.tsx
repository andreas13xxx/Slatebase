import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, it, expect } from 'vitest'
import { UserAvatar } from './UserAvatar'
import type { UserAvatarProps } from './UserAvatar'

afterEach(cleanup)

function baseUser(overrides: Partial<UserAvatarProps['user']> = {}): UserAvatarProps['user'] {
  return {
    username: 'andreas',
    displayName: 'Andreas Müller',
    avatarType: 'initials',
    avatarUrl: '',
    avatarColor: '',
    avatarData: '',
    avatarDicebear: '',
    ...overrides,
  }
}

describe('UserAvatar', () => {
  it('renders an initials tile for type initials', () => {
    const { container } = render(<UserAvatar user={baseUser()} />)
    const tile = container.querySelector('.user-avatar--initials')
    expect(tile).not.toBeNull()
    expect(tile?.textContent).toBe('AM')
    expect(container.querySelector('img')).toBeNull()
  })

  it('uses the configured avatarColor as the tile background', () => {
    const { container } = render(
      <UserAvatar user={baseUser({ avatarColor: '#112233' })} />,
    )
    const tile = container.querySelector('.user-avatar--initials') as HTMLElement
    expect(tile.style.getPropertyValue('--user-avatar-bg')).toBe('#112233')
  })

  it('renders an <img> with the data URL for type image', () => {
    const { container } = render(
      <UserAvatar user={baseUser({ avatarType: 'image', avatarData: 'data:image/png;base64,AAAA' })} />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(img?.getAttribute('alt')).toBe('Andreas Müller')
  })

  it('renders the dicebear URL for type dicebear', () => {
    const url = 'https://api.dicebear.com/9.x/bottts/svg?seed=x'
    const { container } = render(
      <UserAvatar user={baseUser({ avatarType: 'dicebear', avatarDicebear: url })} />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe(url)
  })

  it('renders the external URL for type url', () => {
    const { container } = render(
      <UserAvatar user={baseUser({ avatarType: 'url', avatarUrl: 'https://example.com/a.png' })} />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png')
  })

  it('falls back to an initials tile when the typed field is empty', () => {
    const { container } = render(
      <UserAvatar user={baseUser({ avatarType: 'image', avatarData: '' })} />,
    )
    expect(container.querySelector('.user-avatar--initials')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('applies the size via the --user-avatar-size variable', () => {
    const { container } = render(<UserAvatar user={baseUser()} size={48} />)
    const root = container.querySelector('.user-avatar') as HTMLElement
    expect(root.style.getPropertyValue('--user-avatar-size')).toBe('48px')
  })
})
