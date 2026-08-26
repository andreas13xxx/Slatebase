/**
 * App-wide zoom level — backs `window:zoom-in/out/reset-zoom`.
 * Module-level useSyncExternalStore pattern (see useStatusBarItemVisibility.ts,
 * lessons-learned.md: shared UI toggles use useSyncExternalStore, not useState,
 * so every consumer — here just App.tsx's effect that applies it — stays in sync
 * even though a command dispatch (core-commands-app.ts) has no React state of
 * its own to update directly.
 */
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'slatebase:zoom'
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

function readFromStorage(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_ZOOM
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_ZOOM
    return clamp(parsed)
  } catch {
    return DEFAULT_ZOOM
  }
}

function persistToStorage(zoom: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zoom))
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// ── Module-level state ──

let currentZoom: number | null = null
const subscribers = new Set<() => void>()

function getZoom(): number {
  if (currentZoom === null) currentZoom = readFromStorage()
  return currentZoom
}

function notifySubscribers(): void {
  for (const cb of subscribers) cb()
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

function setZoom(next: number): void {
  const clamped = clamp(round(next))
  if (clamped === currentZoom) return
  currentZoom = clamped
  persistToStorage(clamped)
  notifySubscribers()
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

/** Current zoom factor (1.0 = 100%), reactive — re-renders the calling component on change. */
export function useZoom(): number {
  return useSyncExternalStore(subscribe, getZoom)
}
