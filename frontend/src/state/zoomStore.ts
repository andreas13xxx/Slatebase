/**
 * App-wide zoom level — backs `window:zoom-in/out/reset-zoom`.
 *
 * Stored per user and per vault in `vaultSettingsStore`: the zoom that suits a
 * dense reference vault is rarely the one that suits a writing vault, and it
 * is a personal reading preference, so it must not be forced on everyone who
 * shares the vault. Previously a device-local `localStorage` number.
 *
 * @module state/zoomStore
 */
import { useVaultSetting, updateVaultSettings, getVaultSettings } from './vaultSettingsStore'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1
const DEFAULT_ZOOM = 1.0

function clamp(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Rounds to 2 decimals to avoid float drift from repeated +/- ZOOM_STEP. */
function round(zoom: number): number {
  return Math.round(zoom * 100) / 100
}

/** Current zoom factor, read synchronously (for command handlers). */
export function getZoom(): number {
  return getVaultSettings().zoom
}

function setZoom(next: number): void {
  const clamped = clamp(round(next))
  if (clamped === getZoom()) return
  updateVaultSettings({ zoom: clamped })
}

/** `window:zoom-in` */
export function zoomIn(): void {
  setZoom(getZoom() + ZOOM_STEP)
}

/** `window:zoom-out` */
export function zoomOut(): void {
  setZoom(getZoom() - ZOOM_STEP)
}

/** `window:reset-zoom` */
export function resetZoom(): void {
  setZoom(DEFAULT_ZOOM)
}

/** Current zoom factor (1.0 = 100%), reactive — re-renders on change. */
export function useZoom(): number {
  return useVaultSetting('zoom')
}
