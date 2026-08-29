import './SettingUI.css'

export interface FeatureDisabledHintProps {
  /** Human-readable feature/section name shown in the message. */
  featureName: string
}

/**
 * FeatureDisabledHint — shown instead of a section's content when the
 * backend feature toggle gating it is off. Reused by the unified Settings
 * panel (SettingsContent) and the legacy tab-based settings router (App.tsx)
 * so both surfaces give the same explanation rather than each rendering
 * their own version of "this is off".
 */
export function FeatureDisabledHint({ featureName }: FeatureDisabledHintProps) {
  return (
    <div className="feature-disabled-hint">
      <p className="feature-disabled-hint__title">Das Feature „{featureName}" ist derzeit deaktiviert.</p>
      <p className="feature-disabled-hint__note">Bitte wende dich an einen Administrator, um es zu aktivieren.</p>
    </div>
  )
}
