/**
 * VaultAppearanceSettings — the vault settings Obsidian keeps in `.obsidian/appearance.json`: the
 * base theme, accent colour, font size and fonts.
 *
 * The file lives in the vault, so these values are the same for everyone who opens it and changing
 * them needs write access. The base theme is the vault's default: a user who picked light or dark
 * for themselves keeps their own choice, only users on "System" follow the vault.
 *
 * @module components/settings/VaultAppearanceSettings
 */
import { useTranslation, translateNow, type TranslationKey } from '../../i18n'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  appearanceConfigValueProblem,
  type AppearanceConfigValues,
} from '@slatebase/shared-contracts'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { GENERIC_FONTS, canQueryLocalFonts, detectInstalledFonts, queryAllInstalledFonts } from '../../utils/installedFonts'
import { showToast } from '../ToastNotification'
import { updateAppearance, useAppearanceSnapshot } from '../../state/vaultAppearanceStore'
import { SettingSection, SettingRow, Button } from './ui'

const THEME_LABELS: Record<AppearanceConfigValues['theme'], TranslationKey> = {
  system: 'settingsUi.misc_themeSystem',
  moonstone: 'settingsUi.misc_light',
  obsidian: 'settingsUi.misc_dark',
}

const FONT_FIELDS = [
  { key: 'interfaceFontFamily', labelKey: 'settingsUi.misc_fontInterface' },
  { key: 'textFontFamily', labelKey: 'settingsUi.misc_fontText' },
  { key: 'monospaceFontFamily', labelKey: 'settingsUi.misc_fontMono' },
] as const

interface Draft {
  accentColor: string
  baseFontSize: string
  interfaceFontFamily: string
  textFontFamily: string
  monospaceFontFamily: string
}

function toDraft(stored: AppearanceConfigValues): Draft {
  return {
    accentColor: stored.accentColor,
    baseFontSize: String(stored.baseFontSize),
    interfaceFontFamily: stored.interfaceFontFamily,
    textFontFamily: stored.textFontFamily,
    monospaceFontFamily: stored.monospaceFontFamily,
  }
}

/** Why the draft cannot be saved, per field, or an empty object. */
function problems(draft: Draft): Partial<Record<keyof Draft, string>> {
  const found: Partial<Record<keyof Draft, string>> = {}
  const size = Number(draft.baseFontSize)
  const sizeProblem = draft.baseFontSize.trim() === '' ? translateNow('settingsUi.misc_needNumber') : appearanceConfigValueProblem('baseFontSize', size)
  if (sizeProblem) found.baseFontSize = translateNow('settingsUi.misc_sizeRange')
  const colorProblem = appearanceConfigValueProblem('accentColor', draft.accentColor)
  if (colorProblem) found.accentColor = translateNow('settingsUi.misc_colorFormat')
  for (const { key } of FONT_FIELDS) {
    if (appearanceConfigValueProblem(key, draft[key])) {
      found[key] = 'Erlaubt sind Namen, Ziffern, Leerzeichen und , \' " . _ -'
    }
  }
  return found
}

/**
 * The form. When the file's values change elsewhere (Obsidian, a sync, another tab) an untouched
 * form takes them over; a form with unsaved input keeps what was typed.
 */
function AppearanceForm({ stored, disabled, onSave }: {
  stored: AppearanceConfigValues
  disabled: boolean
  onSave: (draft: Draft) => void
}) {
  const { t } = useTranslation()
  const storedDraft = JSON.stringify(toDraft(stored))
  const [draft, setDraft] = useState<Draft>(() => toDraft(stored))
  const [baseline, setBaseline] = useState(storedDraft)
  if (baseline !== storedDraft) {
    // Adjusting state while rendering, the documented way to follow a prop without an effect.
    setBaseline(storedDraft)
    if (JSON.stringify(draft) === baseline) setDraft(toDraft(stored))
  }
  const found = problems(draft)
  const changed = JSON.stringify(draft) !== storedDraft
  const invalid = Object.keys(found).length > 0
  const set = (key: keyof Draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const [detected] = useState(() => detectInstalledFonts())
  const [allFonts, setAllFonts] = useState<string[] | null>(null)
  const fontOptions = allFonts ?? [...GENERIC_FONTS, ...detected]

  const loadAllFonts = async (): Promise<void> => {
    try {
      setAllFonts([...GENERIC_FONTS, ...await queryAllInstalledFonts()])
    } catch {
      showToast('error', translateNow('settingsUi.misc_fontListDenied'))
    }
  }

  return (
    <>
      <SettingRow label={t('settingsUi.misc_accent')} htmlFor="appearance-accent" hint={found.accentColor ?? t('settingsUi.misc_accentHint')}>
        <input
          id="appearance-accent"
          type="color"
          value={draft.accentColor === '' ? '#7b6cd9' : draft.accentColor}
          onChange={(e) => set('accentColor')(e.target.value)}
          disabled={disabled}
          aria-label={t('settingsUi.misc_accent')}
        />
        <Button variant="secondary" disabled={disabled || draft.accentColor === ''} onClick={() => set('accentColor')('')}>
          {t('settingsUi.misc_reset')}
        </Button>
      </SettingRow>

      <SettingRow label={t('settingsUi.misc_fontSize')} htmlFor="appearance-size" hint={found.baseFontSize ?? t('settingsUi.misc_fontSizeHint')}>
        <input
          id="appearance-size"
          type="number"
          min={10}
          max={30}
          className="settings-field-input"
          value={draft.baseFontSize}
          onChange={(e) => set('baseFontSize')(e.target.value)}
          aria-invalid={found.baseFontSize !== undefined}
          disabled={disabled}
        />
      </SettingRow>

      {FONT_FIELDS.map(({ key, labelKey }) => (
        <SettingRow key={key} label={t(labelKey)} htmlFor={`appearance-${key}`} hint={found[key] ?? t('settingsUi.misc_fontNamesHint')}>
          <div className="font-combo">
          <input
            id={`appearance-${key}`}
            type="text"
            className="settings-field-input"
            value={draft[key]}
            onChange={(e) => set(key)(e.target.value)}
            aria-invalid={found[key] !== undefined}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
          <ChevronDown className="font-combo__icon" size={16} aria-hidden="true" />
          <select
            className="font-combo__select"
            aria-label={t('settingsUi.misc_fontPick', { label: t(labelKey) })}
            value=""
            onChange={(e) => { if (e.target.value !== '') set(key)(e.target.value) }}
            disabled={disabled}
          >
            <option value="" hidden />
            {fontOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          </div>
        </SettingRow>
      ))}

      {canQueryLocalFonts() && allFonts === null && (
        <div className="settings-actions">
          <Button variant="secondary" disabled={disabled} onClick={() => void loadAllFonts()}>
            {t('settingsUi.misc_fontListAll')}
          </Button>
        </div>
      )}

      <div className="settings-actions">
        <Button variant="primary" disabled={disabled || !changed || invalid} onClick={() => onSave(draft)}>
          {t('settingsUi.misc_save')}
        </Button>
      </div>
    </>
  )
}

export function VaultAppearanceSettings() {
  const { t } = useTranslation()
  const { state } = useAppContext()
  const vaultId = state.selectedVaultId
  const canWrite = state.vaults.find((vault) => vault.id === vaultId)?.permission !== 'read'
  const stored = useAppearanceSnapshot()
  const [saving, setSaving] = useState(false)

  if (!vaultId) return null

  const save = async (change: Parameters<typeof updateAppearance>[0]): Promise<void> => {
    setSaving(true)
    try {
      await updateAppearance(change)
    } catch (error: unknown) {
      showToast('error', translateNow('settingsUi.misc_saveFailedWith', { detail: extractErrorMessage(error) }))
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canWrite || saving

  return (
    <SettingSection
      title={t('settingsUi.misc_vaultLook')}
      description={t('settingsUi.misc_vaultLookDesc')}
    >
      {!canWrite && <p className="settings-field-hint">{t('settingsUi.misc_vaultLookReadOnly')}</p>}

      <SettingRow
        label={t('settingsUi.misc_baseTheme')}
        htmlFor="appearance-theme"
        hint={t('settingsUi.misc_baseThemeHint')}
      >
        <select
          id="appearance-theme"
          className="settings-field-input"
          value={stored.theme}
          onChange={(e) => void save({ theme: e.target.value as AppearanceConfigValues['theme'] })}
          disabled={disabled}
        >
          {(Object.keys(THEME_LABELS) as Array<AppearanceConfigValues['theme']>).map((key) => (
            <option key={key} value={key}>{t(THEME_LABELS[key])}</option>
          ))}
        </select>
      </SettingRow>

      <AppearanceForm
        stored={stored}
        disabled={disabled}
        onSave={(draft) => void save({
          accentColor: draft.accentColor === '' ? null : draft.accentColor,
          baseFontSize: Number(draft.baseFontSize) === 16 ? null : Number(draft.baseFontSize),
          interfaceFontFamily: draft.interfaceFontFamily.trim() === '' ? null : draft.interfaceFontFamily.trim(),
          textFontFamily: draft.textFontFamily.trim() === '' ? null : draft.textFontFamily.trim(),
          monospaceFontFamily: draft.monospaceFontFamily.trim() === '' ? null : draft.monospaceFontFamily.trim(),
        })}
      />
    </SettingSection>
  )
}
