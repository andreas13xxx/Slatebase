/**
 * SidedockBridge - module-level bridge between the plugin workspace shim and
 * the real side panels.
 *
 * `workspace.leftSplit`/`rightSplit` (`WorkspaceSidedock`) must report and
 * change whether a sidebar is collapsed, but the visibility state lives in
 * React (`AppContent`). The component that owns it (`CommandPaletteContainer`)
 * registers a controller here; the shim reads and toggles through it. Same
 * module-level pattern as `pane-split-bridge.ts`.
 *
 * Sides follow Obsidian: `left` is Slatebase's sidebar, `right` its context panel.
 *
 * @module sidedock-bridge
 */

/** Which side panel a sidedock stands for. */
export type SidedockSide = 'left' | 'right'

/** Reads and toggles the visibility of the real side panels. */
export interface SidedockController {
  /** `true` while the panel is hidden. */
  isCollapsed(side: SidedockSide): boolean
  /** Flips the panel between shown and hidden. */
  toggle(side: SidedockSide): void
}

let controller: SidedockController | null = null

/** Register (or, with `null`, remove) the controller. Called by the owner of the panel state. */
export function setSidedockController(next: SidedockController | null): void {
  controller = next
}

/** The registered controller, or `null` when no host is mounted (unit tests, headless). */
export function getSidedockController(): SidedockController | null {
  return controller
}
