/**
 * Collapsed state of the "Eigenschaften" (frontmatter) box, shared by Live Preview and the
 * reading view so a note looks the same after switching modes. Module-level on purpose: both
 * surfaces rebuild their DOM on every edit, so the state cannot live in a widget or component.
 * Session-only — it is a view preference, not document data.
 */
let collapsed = false

/** Whether the properties box is currently folded. */
export function isPropertiesCollapsed(): boolean {
  return collapsed
}

/** Folds or unfolds the properties box. */
export function setPropertiesCollapsed(value: boolean): void {
  collapsed = value
}
