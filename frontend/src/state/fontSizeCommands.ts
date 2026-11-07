/**
 * fontSizeCommands — backs Obsidian 1.14's "Increase/Decrease font size" commands.
 *
 * Unlike `window:zoom-*` (which scales the whole UI per user), these change the
 * vault's base font size in `.obsidian/appearance.json`, exactly like the
 * "Schriftgröße" field in the vault's appearance settings: shared by everyone
 * who opens the vault, and needs write access.
 *
 * @module state/fontSizeCommands
 */
import { APPEARANCE_CONFIG_DEFAULTS } from '@slatebase/shared-contracts'
import { getAppearanceValue, updateAppearance } from './vaultAppearanceStore'

/** Bounds of `baseFontSize` in `shared-contracts/src/appearance-config.ts`. */
export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 30
const FONT_SIZE_STEP = 1

/**
 * Moves the vault's base font size by `delta` pixels, clamped to the allowed
 * range. Resolves without writing when the size is already at the bound.
 * The default size is stored as "unset", like the settings form does.
 */
export async function changeFontSize(delta: number): Promise<void> {
  const current = getAppearanceValue('baseFontSize')
  const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(current + delta)))
  if (next === current) return
  await updateAppearance({ baseFontSize: next === APPEARANCE_CONFIG_DEFAULTS.baseFontSize ? null : next })
}

/** "Increase font size" */
export function increaseFontSize(): Promise<void> {
  return changeFontSize(FONT_SIZE_STEP)
}

/** "Decrease font size" */
export function decreaseFontSize(): Promise<void> {
  return changeFontSize(-FONT_SIZE_STEP)
}
