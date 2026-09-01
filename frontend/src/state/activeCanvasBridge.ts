/**
 * Bridge exposing the currently-mounted CanvasView's viewport controls to
 * `core-commands-app.ts`, which has no direct reference into a canvas tab's
 * own `CanvasProvider` state/dispatch (unlike tabs/panels, which live in
 * `CoreAppCommandHandlers`). Same module-scoped "active instance" pattern as
 * `editor/plugin-extensions.ts`'s `setActiveEditorView`/`getActiveEditorView`.
 */
export interface ActiveCanvasController {
  /**
   * Jumps the viewport to the single selected group node.
   * @returns false when there isn't exactly one group node selected (nothing to jump to).
   */
  jumpToSelectedGroup(): boolean

  /**
   * Rasterizes the whole canvas to a PNG and triggers a download. Shows its
   * own toast on failure (empty canvas, capture error) — the caller only
   * needs to handle the "no canvas tab is active at all" case itself, since
   * that's the one failure this controller can't self-report.
   * @returns false if there was nothing to export or the capture failed.
   */
  exportAsImage(): Promise<boolean>
}

let activeController: ActiveCanvasController | null = null

/** Registers/clears the active canvas controller. Called by CanvasView on mount/unmount. */
export function setActiveCanvasController(controller: ActiveCanvasController | null): void {
  activeController = controller
}

/** Gets the currently-mounted canvas's controller, or null if no canvas tab is active. */
export function getActiveCanvasController(): ActiveCanvasController | null {
  return activeController
}
