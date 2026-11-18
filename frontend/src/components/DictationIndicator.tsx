/**
 * DictationIndicator — floating status panel for the voice-transcription
 * feature. Renders nothing while idle; shows a recording panel (stop button,
 * language picker, "save audio" toggle) while recording, a processing state
 * with a wait hint, and an error alert.
 *
 * State comes from the shared `DictationController` (via `useSyncExternalStore`)
 * so it stays in sync with the `voice:toggle-dictation` command. Accessibility:
 * live regions announce recording/processing (`role="status"`, `aria-live`
 * polite) and errors (`role="alert"`).
 */
import { useSyncExternalStore, useCallback } from 'react'
import { useTranslation, type TranslationKey } from '../i18n'
import { Mic, Square, Loader2, AlertCircle, X } from 'lucide-react'
import type { IApiClient } from '../api'
import { getDictationController } from '../editor/dictation/dictation-controller'
import { useTranscriptionLanguage } from '../hooks/useTranscriptionLanguage'
import './DictationIndicator.css'

/** Language options offered in the indicator. Mirrors the backend default set. */
const LANGUAGE_OPTIONS: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'auto', labelKey: 'commonUi.c_dictAuto' },
  { value: 'de', labelKey: 'commonUi.c_dictDe' },
  { value: 'en', labelKey: 'commonUi.c_dictEn' },
]

export interface DictationIndicatorProps {
  /** The active vault; the indicator is inert without one. */
  vaultId: string | null
  /** The shared API client. */
  apiClient: IApiClient | null
}

export function DictationIndicator({ vaultId, apiClient }: DictationIndicatorProps) {
  const { t } = useTranslation()
  const controller = getDictationController()
  const state = useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.getState(),
  )
  const { language, setLanguage, saveAudio, setSaveAudio } = useTranscriptionLanguage()

  const stop = useCallback(() => {
    if (!vaultId || !apiClient) return
    void controller.toggle({ apiClient, vaultId, language, saveAudio })
  }, [controller, vaultId, apiClient, language, saveAudio])

  const dismiss = useCallback(() => { controller.reset() }, [controller])

  if (state.status === 'idle') return null

  return (
    <div className="dictation-indicator" data-status={state.status}>
      {state.status === 'recording' && (
        <div className="dictation-indicator__panel" role="status" aria-live="polite">
          <span className="dictation-indicator__pulse" aria-hidden="true">
            <Mic size={16} />
          </span>
          <span className="dictation-indicator__label">{t('commonUi.c_recording')}</span>

          <label className="dictation-indicator__lang">
            <span className="dictation-indicator__visually-hidden">{t('commonUi.c_language')}</span>
            <select
              value={language}
              onChange={(e) => { setLanguage(e.target.value) }}
              aria-label={t('commonUi.c_dictLanguage')}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </label>

          <label className="dictation-indicator__save">
            <input
              type="checkbox"
              checked={saveAudio}
              onChange={(e) => { setSaveAudio(e.target.checked) }}
            />
            <span>{t('commonUi.c_saveAudio')}</span>
          </label>

          <button type="button" className="dictation-indicator__stop" onClick={stop}>
            <Square size={14} aria-hidden="true" />
            <span>{t('commonUi.c_stopConvert')}</span>
          </button>
        </div>
      )}

      {state.status === 'processing' && (
        <div className="dictation-indicator__panel" role="status" aria-live="polite">
          <Loader2 size={16} className="dictation-indicator__spinner" aria-hidden="true" />
          <span className="dictation-indicator__label">
            {t('commonUi.c_converting')}
          </span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="dictation-indicator__panel dictation-indicator__panel--error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span className="dictation-indicator__label">{state.error ?? t('commonUi.c_dictFailed')}</span>
          <button
            type="button"
            className="dictation-indicator__dismiss"
            onClick={dismiss}
            aria-label={t('commonUi.c_closeHint')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
