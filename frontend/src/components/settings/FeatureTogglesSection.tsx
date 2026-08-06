import { useEffect } from 'react'
import type { IApiClient } from '../../api'
import { useFeatureContext } from '../../state/featureContext'
import { loadFeatures, toggleFeature } from '../../state/featureActions'
import { AlertTriangle, Loader, AlertCircle } from 'lucide-react'

/** Props for the FeatureTogglesSection component. */
export interface FeatureTogglesSectionProps {
  /** API client instance for making feature toggle requests. */
  apiClient: IApiClient
}

/**
 * Self-contained feature toggles section for the unified Settings panel.
 * Renders the list of feature toggles with on/off switches, optimistic updates,
 * and rollback on failure. Reads/writes the global FeatureContext directly via
 * the shared loadFeatures()/toggleFeature() action creators — this is also
 * what App.tsx's isEnabled() gating reads from, so an admin toggling a
 * feature here takes effect app-wide immediately, without a page reload.
 *
 * Extracted from AdminConfigPage. No outer layout wrapper — intended to be
 * placed inside SettingsContent.
 */
export function FeatureTogglesSection({ apiClient }: FeatureTogglesSectionProps) {
  const { state, dispatch: featureDispatch } = useFeatureContext()

  useEffect(() => {
    void loadFeatures(featureDispatch, apiClient)
  }, [featureDispatch, apiClient])

  // A load failure leaves `features` empty; a toggle failure happens after a
  // successful load, so `features` is non-empty. Both share `state.error`.
  const loadFailed = state.error !== null && state.features.length === 0
  const toggleFailed = state.error !== null && state.features.length > 0

  if (state.isLoading) {
    return (
      <div className="feature-toggle-loading">
        <Loader size={16} className="feature-toggle-spinner" />
        <span>Laden…</span>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <div className="feature-toggle-error">
        <AlertCircle size={14} />
        <span>{state.error}</span>
        <button
          type="button"
          className="feature-toggle-retry-btn"
          onClick={() => void loadFeatures(featureDispatch, apiClient)}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div className="feature-toggles-section">
      {toggleFailed && (
        <div className="feature-toggle-toast">
          <AlertCircle size={14} />
          <span>{state.error}</span>
          <button
            type="button"
            className="feature-toggle-toast-close"
            onClick={() => featureDispatch({ type: 'FEATURE_ERROR_CLEARED' })}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
      )}
      {state.features.map(feature => (
        <div
          key={feature.name}
          className={`feature-toggle-item${!feature.enabled ? ' feature-toggle-item--disabled' : ''}`}
        >
          <div className="feature-toggle-info">
            <div className="feature-toggle-name">{feature.name}</div>
            <div className="feature-toggle-description">{feature.description}</div>
            {feature.type === 'cold' && (
              <div className="feature-toggle-cold-hint">
                <AlertTriangle size={12} />
                Neustart erforderlich
              </div>
            )}
          </div>
          <label className="feature-toggle-switch">
            <input
              type="checkbox"
              checked={feature.enabled}
              onChange={() => void toggleFeature(featureDispatch, apiClient, feature.name, !feature.enabled, feature.enabled)}
              aria-label={`${feature.name} ${feature.enabled ? 'deaktivieren' : 'aktivieren'}`}
            />
            <span className="feature-toggle-switch__slider" />
          </label>
        </div>
      ))}
    </div>
  )
}
