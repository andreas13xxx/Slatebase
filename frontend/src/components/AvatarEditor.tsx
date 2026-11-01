import React, { useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useTranslation } from '../i18n'
import type { AvatarType, PublicUserInfo } from '../state/authState'
import { UserAvatar } from './UserAvatar'
import {
  resizeImageToDataUrl,
  imageBlobFromClipboard,
  ImageResizeError,
} from '../utils/imageResize'
import { dicebearUrl, dicebearSeeds, DICEBEAR_STYLES, type DicebearStyle } from '../utils/dicebear'
import { extractErrorMessage } from '../utils/error'
import './AvatarEditor.css'

/** The subset of avatar fields the editor owns. */
export interface AvatarValue {
  avatarType: AvatarType
  avatarUrl: string
  avatarColor: string
  avatarData: string
  avatarDicebear: string
}

/** Props for {@link AvatarEditor}. */
export interface AvatarEditorProps {
  /** The username, used for the preview tile and DiceBear seeds. */
  username: string
  /** The display name, used for the preview tile. */
  displayName: string
  /** Current avatar values (controlled). */
  value: AvatarValue
  /** Called with the next avatar values on any change. */
  onChange: (next: AvatarValue) => void
}

/** Preset initials-tile background colours offered as swatches. */
const PRESET_COLORS = [
  '#e4572e', '#f3a712', '#4c9f70', '#2d7dd2', '#8e44ad', '#d64550',
] as const

/**
 * Avatar editor: a type switcher (initials / URL / DiceBear gallery / upload)
 * with per-type controls and a live preview. Owns no persistence — the parent
 * form sends the values on save. Image downscaling, DiceBear URL building and
 * preview rendering reuse the shared utilities so nothing drifts.
 */
export function AvatarEditor({ username, displayName, value, onChange }: AvatarEditorProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dicebearStyle, setDicebearStyle] = useState<DicebearStyle>('bottts')
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageProcessing, setImageProcessing] = useState(false)

  // The preview reflects the current (unsaved) values.
  const previewUser: Pick<
    PublicUserInfo,
    'username' | 'displayName' | 'avatarType' | 'avatarUrl' | 'avatarColor' | 'avatarData' | 'avatarDicebear'
  > = { username, displayName, ...value }

  function setType(avatarType: AvatarType): void {
    onChange({ ...value, avatarType })
  }

  async function handleImageBlob(blob: Blob): Promise<void> {
    setImageError(null)
    setImageProcessing(true)
    try {
      const dataUrl = await resizeImageToDataUrl(blob)
      onChange({ ...value, avatarType: 'image', avatarData: dataUrl })
    } catch (err: unknown) {
      if (err instanceof ImageResizeError && err.code === 'TOO_LARGE') {
        setImageError(t('profile.avatar.imageTooLarge'))
      } else {
        setImageError(extractErrorMessage(err, t('profile.avatar.imageDecodeFailed')))
      }
    } finally {
      setImageProcessing(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) void handleImageBlob(file)
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) void handleImageBlob(file)
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>): void {
    const blob = imageBlobFromClipboard(e.nativeEvent)
    if (blob) {
      e.preventDefault()
      void handleImageBlob(blob)
    }
  }

  const seeds = dicebearSeeds(username || displayName || 'avatar')

  return (
    <div className="avatar-editor">
      <div className="avatar-editor__preview">
        <UserAvatar user={previewUser} size={72} />
        <span className="avatar-editor__preview-label">{t('profile.avatar.preview')}</span>
      </div>

      <fieldset className="avatar-editor__types">
        <legend className="avatar-editor__legend">{t('profile.avatar.typeLegend')}</legend>
        <div className="avatar-editor__type-options" role="radiogroup" aria-label={t('profile.avatar.typeLegend')}>
          {([
            ['initials', t('profile.avatar.typeInitials')],
            ['dicebear', t('profile.avatar.typeDicebear')],
            ['image', t('profile.avatar.typeImage')],
            ['url', t('profile.avatar.typeUrl')],
          ] as const).map(([type, label]) => (
            <label key={type} className="avatar-editor__type-option">
              <input
                type="radio"
                name="avatar-type"
                value={type}
                checked={value.avatarType === type}
                onChange={() => setType(type)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {value.avatarType === 'initials' && (
        <div className="avatar-editor__panel">
          <span className="avatar-editor__field-label">{t('profile.avatar.colorLabel')}</span>
          <div className="avatar-editor__swatches">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={
                  value.avatarColor === color
                    ? 'avatar-editor__swatch avatar-editor__swatch--selected'
                    : 'avatar-editor__swatch'
                }
                style={{ '--swatch-bg': color } as React.CSSProperties}
                aria-label={color}
                aria-pressed={value.avatarColor === color}
                onClick={() => onChange({ ...value, avatarColor: color })}
              />
            ))}
          </div>
          <label className="avatar-editor__field-label" htmlFor="avatar-color-custom">
            {t('profile.avatar.colorCustom')}
          </label>
          <input
            id="avatar-color-custom"
            type="color"
            className="avatar-editor__color-input"
            value={value.avatarColor || '#2d7dd2'}
            onChange={(e) => onChange({ ...value, avatarColor: e.target.value })}
          />
        </div>
      )}

      {value.avatarType === 'url' && (
        <div className="avatar-editor__panel">
          <label className="avatar-editor__field-label" htmlFor="avatar-url-input">
            {t('profile.avatarUrl')}
          </label>
          <input
            id="avatar-url-input"
            type="url"
            className="avatar-editor__url-input"
            maxLength={2048}
            value={value.avatarUrl}
            placeholder="https://example.com/avatar.png"
            onChange={(e) => onChange({ ...value, avatarUrl: e.target.value })}
          />
        </div>
      )}

      {value.avatarType === 'dicebear' && (
        <div className="avatar-editor__panel">
          <label className="avatar-editor__field-label" htmlFor="avatar-dicebear-style">
            {t('profile.avatar.dicebearStyleLabel')}
          </label>
          <select
            id="avatar-dicebear-style"
            className="avatar-editor__select"
            value={dicebearStyle}
            onChange={(e) => setDicebearStyle(e.target.value as DicebearStyle)}
          >
            {DICEBEAR_STYLES.map((style) => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
          <div className="avatar-editor__gallery">
            {seeds.map((seed) => {
              const url = dicebearUrl(dicebearStyle, seed)
              const selected = value.avatarDicebear === url
              return (
                <button
                  key={seed}
                  type="button"
                  className={
                    selected
                      ? 'avatar-editor__gallery-item avatar-editor__gallery-item--selected'
                      : 'avatar-editor__gallery-item'
                  }
                  aria-label={t('profile.avatar.dicebearPick')}
                  aria-pressed={selected}
                  onClick={() => onChange({ ...value, avatarType: 'dicebear', avatarDicebear: url })}
                >
                  <img src={url} alt="" className="avatar-editor__gallery-img" />
                </button>
              )
            })}
          </div>
          <p className="avatar-editor__hint">{t('profile.avatar.dicebearHint')}</p>
        </div>
      )}

      {value.avatarType === 'image' && (
        <div className="avatar-editor__panel">
          {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions */}
          <div
            className="avatar-editor__dropzone"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={handlePaste}
            tabIndex={0}
            role="button"
            aria-label={t('profile.avatar.uploadDropHint')}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
          >
            {t('profile.avatar.uploadDropHint')}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="avatar-editor__file-input"
            aria-label={t('profile.avatar.uploadButton')}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="avatar-editor__upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('profile.avatar.uploadButton')}
          </button>
          <p className="avatar-editor__hint">{t('profile.avatar.uploadPasteHint')}</p>
          {imageProcessing && (
            <p className="avatar-editor__hint" role="status" aria-live="polite">
              {t('profile.avatar.imageProcessing')}
            </p>
          )}
          {imageError && (
            <p className="avatar-editor__error" role="alert">{imageError}</p>
          )}
        </div>
      )}
    </div>
  )
}
