/**
 * Puts the CSS variables of a vault's appearance.json (accent colour, fonts, font size) on
 * `document.body`, where Obsidian puts them and where themes and snippets read them. A variable that
 * was set before and is no longer wanted is removed, so the theme's own value comes back. What was
 * set is remembered per element, so each target is cleaned up on its own.
 *
 * @module plugins/appearance/appearance-variables
 */

const appliedByTarget = new WeakMap<HTMLElement, Set<string>>()

export function applyAppearanceVariables(variables: Record<string, string>, target: HTMLElement = document.body): void {
  for (const name of appliedByTarget.get(target) ?? []) {
    if (!(name in variables)) target.style.removeProperty(name)
  }
  for (const [name, value] of Object.entries(variables)) target.style.setProperty(name, value)
  appliedByTarget.set(target, new Set(Object.keys(variables)))
}

/** Removes everything the last call set on the target (logout, no vault). */
export function clearAppearanceVariables(target: HTMLElement = document.body): void {
  applyAppearanceVariables({}, target)
}
