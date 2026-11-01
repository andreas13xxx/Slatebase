import type { CSSProperties } from 'react'
import type { PublicUserInfo } from '../state/authState'
import { getInitials, colorFromName, readableTextColor } from './userAvatarUtils'
import './UserAvatar.css'

/** Props for the shared {@link UserAvatar} component. */
export interface UserAvatarProps {
  /** The user whose avatar to render (its `avatarType` + fields drive the output). */
  user: Pick<
    PublicUserInfo,
    'username' | 'displayName' | 'avatarType' | 'avatarUrl' | 'avatarColor' | 'avatarData' | 'avatarDicebear'
  >
  /** Rendered size in pixels (width = height). Defaults to 32. */
  size?: number
  /** Optional extra class on the root element. */
  className?: string
}

/**
 * Single rendering path for a user's avatar, shared by the user menu, the
 * profile page and any later call site, so they cannot drift.
 *
 * - `image` → inline data-URL `<img>`
 * - `dicebear` → external DiceBear `<img>`
 * - `url` → external URL `<img>`
 * - otherwise → coloured initials tile (background `avatarColor` or a
 *   deterministic colour from the username; text colour picked for contrast)
 *
 * The pixel size is passed through a `--user-avatar-size` CSS variable rather
 * than inline width/height, so all static styling stays in `UserAvatar.css`.
 */
export function UserAvatar({ user, size = 32, className }: UserAvatarProps) {
  const rootClass = className ? `user-avatar ${className}` : 'user-avatar'
  const sizeStyle = { '--user-avatar-size': `${size}px` } as CSSProperties
  const displayName = user.displayName || user.username

  const imageSrc =
    user.avatarType === 'image' && user.avatarData
      ? user.avatarData
      : user.avatarType === 'dicebear' && user.avatarDicebear
        ? user.avatarDicebear
        : user.avatarType === 'url' && user.avatarUrl
          ? user.avatarUrl
          : null

  if (imageSrc !== null) {
    return (
      <span className={rootClass} style={sizeStyle}>
        <img className="user-avatar__img" src={imageSrc} alt={displayName} />
      </span>
    )
  }

  const background = user.avatarColor || colorFromName(user.username)
  const tileStyle = {
    ...sizeStyle,
    '--user-avatar-bg': background,
    '--user-avatar-fg': readableTextColor(background),
  } as CSSProperties

  return (
    <span className={`${rootClass} user-avatar--initials`} style={tileStyle} aria-label={displayName}>
      {getInitials(displayName)}
    </span>
  )
}
