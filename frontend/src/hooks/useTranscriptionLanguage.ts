/**
 * useTranscriptionLanguage — dictation language + "save audio attachment"
 * preference for the voice-transcription feature.
 *
 * Stored per user *and* per vault via `vaultSettingsStore` (same pattern as
 * `useSpellcheck`): a German notebook and an English one each remember their
 * own dictation language, and the choice follows the account across devices.
 *
 * `'auto'` means "let the Whisper backend detect the language".
 */
import { useCallback } from 'react'
import { useVaultSettings, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'

/** A dictation language selection: a Whisper code or 'auto'. */
export type TranscriptionLanguageSelection = string

/** Return value of the useTranscriptionLanguage hook. */
export interface UseTranscriptionLanguageReturn {
  /** The currently selected dictation language ('auto' or a Whisper code). */
  language: TranscriptionLanguageSelection
  /** Sets the dictation language for the active vault. */
  setLanguage(language: TranscriptionLanguageSelection): void
  /** Whether recordings are also saved as a vault audio attachment. */
  saveAudio: boolean
  /** Toggles the "save audio attachment" preference. */
  setSaveAudio(value: boolean): void
}

/** The stored dictation language, from outside React (controller, command). */
export function getTranscriptionLanguage(): TranscriptionLanguageSelection {
  return getVaultSettings().transcriptionLanguage || 'auto'
}

/** Whether recordings are saved as an attachment, from outside React. */
export function getSaveAudioAttachment(): boolean {
  return getVaultSettings().saveAudioAttachment
}

/** Dictation language + attachment preference for the active vault. */
export function useTranscriptionLanguage(): UseTranscriptionLanguageReturn {
  const settings = useVaultSettings()

  const setLanguage = useCallback((language: TranscriptionLanguageSelection) => {
    updateVaultSettings({ transcriptionLanguage: language })
  }, [])
  const setSaveAudio = useCallback((value: boolean) => {
    updateVaultSettings({ saveAudioAttachment: value })
  }, [])

  return {
    language: settings.transcriptionLanguage || 'auto',
    setLanguage,
    saveAudio: settings.saveAudioAttachment,
    setSaveAudio,
  }
}
