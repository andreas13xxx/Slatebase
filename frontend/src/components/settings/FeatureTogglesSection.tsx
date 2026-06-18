import { useState, useEffect, useCallback } from 'react'
import type { IApiClient, FeatureToggleState } from '../../api'
import { useFeatureContext } from '../../state/featureContext'
import { AlertTriangle, Loader, AlertCircle } from 'lucide-react'

/** Props for the FeatureTogglesSection component. */
export interface FeatureTogglesSectionProps {
  /** API client instance for making feature toggle requests. */
  apiClient: IApiClient
}

/**
 * Self-contained feature toggles section for the unified Settings panel.
 * Renders the list of feature toggles with on/off switches, optimistic updates,
 * and rollback on failure. Syncs toggle state with the global FeatureContext.
 *
 * Extracted from AdminConfigPage. No outer layout wrapper — intended to be
 * placed inside SettingsContent.
 */
export function FeatureTogglesSection({ apiClient }: FeatureTogglesSectionProps) {
  const { dispatch: featureDispatch } = useFeatureContext()

  const [adminFeatures, setAdminFeatures] = useState<FeatureToggleState[]>([])
  const [featuresLoading, setFeaturesLoading] = useState(true)
  const [featuresError, setFeaturesError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const loadAdminFeatures = useCallback(async () => {
    setFeaturesLoading(true)
    setFeaturesError(null)
    try {
      const features = await apiClient.loadAdminFeatures()
      setAdminFeatures(features)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ?
          String((err as { message: unknown }).message) : 'Fehler beim Laden der Feature-Toggles'
      setFeaturesError(message)
    } finally {
      setFeaturesLoading(false)
    }
  }, [apiClient])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount, setState is async/deferred
    void loadAdminFeatures()
  }, [loadAdminFeatures])

  async function handleToggle(featureName: string, currentEnabled: boolean): Promise<void> {
    setToggleError(null)
    const newEnabled = !currentEnabled

    // Optimistic update on local admin features list
    setAdminFeatures(prev => prev.map(f =>
      f.name === featureName ? { ...f, enabled: newEnabled } : f
    ))

    // Also update the global feature context optimistically
    featureDispatch({ type: 'FEATURE_UPDATED', name: featureName, enabled: newEnabled })

    try {
      await apiClient.toggleAdminFeature(featureName, newEnabled)
    } catch (err: unknown) {
      // Rollback local admin features
      setAdminFeatures(prev => prev.map(f =>
        f.name === featureName ? { ...f, enabled: currentEnabled } : f
      ))
      // Rollback global feature context
      featureDispatch({ type: 'FEATURE_UPDATED', name: featureName, enabled: currentEnabled })

      const message = err instanceof Error ? err.message :
        (typeof err === 'object' && err !== null && 'message' in err) ?
          String((err as { message: unknown }).message) : 'Fehler beim Ändern des Features'
      setToggleError(message)
    }
  }

  if (featuresLoading) {
    return (
      <div className="feature-toggle-loading">
        <Loader size={16} className="feature-toggle-spinner" />
        <span>Laden…</span>
      </div>
    )
  }

  if (featuresError) {
    return (
      <div className="feature-toggle-error">
        <AlertCircle size={14} />
        <span>{featuresError}</span>
        <button
          type="button"
          className="feature-toggle-retry-btn"
          onClick={() => void loadAdminFeatures()}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <div className="feature-toggles-section">
      {toggleError && (
        <div className="feature-toggle-toast">
          <AlertCircle size={14} />
          <span>{toggleError}</span>
          <button
            type="button"
            className="feature-toggle-toast-close"
            onClick={() => setToggleError(null)}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
      )}
      {adminFeatures.map(feature => (
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
              onChange={() => void handleToggle(feature.name, feature.enabled)}
              aria-label={`${feature.name} ${feature.enabled ? 'deaktivieren' : 'aktivieren'}`}
            />
            <span className="feature-toggle-switch__slider" />
          </label>
        </div>
      ))}
    </div>
  )
}
