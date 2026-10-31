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
import { useState } from 'react'
import {
  appearanceConfigValueProblem,
  type AppearanceConfigValues,
} from '@slatebase/shared-contracts'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { showToast } from '../ToastNotification'
import { updateAppearance, useAppearanceSnapshot } from '../../state/vaultAppearanceStore'
import { SettingSection, SettingRow, Button } from './ui'

const THEME_LABELS: Record<AppearanceConfigValues['theme'], string> = {
  system: 'Dem System folgen',
  moonstone: 'Hell',
  obsidian: 'Dunkel',
}

const FONT_FIELDS = [
  { key: 'interfaceFontFamily', label: 'Schrift der Oberfläche' },
  { key: 'textFontFamily', label: 'Schrift der Texte' },
  { key: 'monospaceFontFamily', label: 'Schrift für Code' },
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
  const sizeProblem = draft.baseFontSize.trim() === '' ? 'Bitte eine Zahl angeben.' : appearanceConfigValueProblem('baseFontSize', size)
  if (sizeProblem) found.baseFontSize = 'Die Schriftgröße muss zwischen 10 und 30 liegen.'
  const colorProblem = appearanceConfigValueProblem('accentColor', draft.accentColor)
  if (colorProblem) found.accentColor = 'Die Farbe muss als #rrggbb angegeben werden.'
  for (const { key } of FONT_FIELDS) {
    if (appearanceConfigValueProblem(key, draft[key])) {
      found[key] = 'Erlaubt sind Namen, Ziffern, Leerzeichen und , \' " . _ -'
    }
  }
  return found
}

/** The form. Mounted with `key={stored}`, so it starts from the file's values again when they change elsewhere. */
function AppearanceForm({ stored, disabled, onSave }: {
  stored: AppearanceConfigValues
  disabled: boolean
  onSave: (draft: Draft) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(stored))
  const found = problems(draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(toDraft(stored))
  const invalid = Object.keys(found).length > 0
  const set = (key: keyof Draft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }))

  return (
    <>
      <SettingRow label="Akzentfarbe" htmlFor="appearance-accent" hint={found.accentColor ?? 'Leer = Farbe des Themes.'}>
        <input
          id="appearance-accent"
          type="color"
          value={draft.accentColor === '' ? '#7b6cd9' : draft.accentColor}
          onChange={(e) => set('accentColor')(e.target.value)}
          disabled={disabled}
          aria-label="Akzentfarbe"
        />
        <Button variant="secondary" disabled={disabled || draft.accentColor === ''} onClick={() => set('accentColor')('')}>
          Zurücksetzen
        </Button>
      </SettingRow>

      <SettingRow label="Schriftgröße" htmlFor="appearance-size" hint={found.baseFontSize ?? 'In Pixeln, Standard 16.'}>
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

      {FONT_FIELDS.map(({ key, label }) => (
        <SettingRow key={key} label={label} htmlFor={`appearance-${key}`} hint={found[key] ?? 'Schriftnamen mit Komma getrennt. Leer = Schrift des Themes.'}>
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
        </SettingRow>
      ))}

      <div className="settings-actions">
        <Button variant="primary" disabled={disabled || !changed || invalid} onClick={() => onSave(draft)}>
          Speichern
        </Button>
      </div>
    </>
  )
}

export function VaultAppearanceSettings() {
  const { state } = useAppContext()
  const vaultId = state.selectedVaultId
  const canWrite = state.vaults.find((vault) => vault.id === vaultId)?.permission !== 'read'
  const stored = useAppearanceSnapshot() as unknown as AppearanceConfigValues
  const [saving, setSaving] = useState(false)

  if (!vaultId) return null

  const save = async (change: Parameters<typeof updateAppearance>[0]): Promise<void> => {
    setSaving(true)
    try {
      await updateAppearance(change)
    } catch (error: unknown) {
      showToast('error', `Einstellung konnte nicht gespeichert werden: ${extractErrorMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canWrite || saving

  return (
    <SettingSection
      title="Darstellung des Vaults"
      description="Basis-Theme, Akzentfarbe und Schriften. Gespeichert in .obsidian/appearance.json, wie in Obsidian, und gültig für alle, die den Vault öffnen."
    >
      {!canWrite && <p className="settings-field-hint">Ändern darf diese Einstellungen, wer den Vault bearbeiten darf.</p>}

      <SettingRow
        label="Basis-Theme"
        htmlFor="appearance-theme"
        hint="Vorgabe des Vaults. Wer in seinem Profil Hell oder Dunkel gewählt hat, behält die eigene Wahl."
      >
        <select
          id="appearance-theme"
          className="settings-field-input"
          value={stored.theme}
          onChange={(e) => void save({ theme: e.target.value as AppearanceConfigValues['theme'] })}
          disabled={disabled}
        >
          {(Object.keys(THEME_LABELS) as Array<AppearanceConfigValues['theme']>).map((key) => (
            <option key={key} value={key}>{THEME_LABELS[key]}</option>
          ))}
        </select>
      </SettingRow>

      <AppearanceForm
        key={JSON.stringify([stored.accentColor, stored.baseFontSize, stored.interfaceFontFamily, stored.textFontFamily, stored.monospaceFontFamily])}
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
