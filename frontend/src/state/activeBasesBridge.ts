/**
 * Bridge exposing the currently-mounted BasesView's actions to
 * `core-commands-app.ts` (the `bases:*` core commands), which has no direct
 * reference into a base tab's own state. Same module-scoped "active instance"
 * pattern as `activeCanvasBridge.ts`.
 */
export interface ActiveBasesController {
  /** Switch to the next view of the base (wraps around). @returns false when there is only one view. */
  nextView(): boolean

  /** Append a new table view and switch to it. @returns false when the base is read-only or unparsable. */
  addView(): boolean

  /**
   * Copy the displayed table as tab-separated text (pastes cleanly into a
   * spreadsheet). @returns false when no table is displayed or the clipboard write failed.
   */
  copyTable(): Promise<boolean>
}

let activeController: ActiveBasesController | null = null

/** Registers/clears the active base controller. Called by BasesView on mount/unmount. */
export function setActiveBasesController(controller: ActiveBasesController | null): void {
  activeController = controller
}

/** Gets the currently-mounted base's controller, or null if no base tab is active. */
export function getActiveBasesController(): ActiveBasesController | null {
  return activeController
}

/** Render an HTML table as TSV: one line per row, cells joined by tabs. Sort markers (▲/▼) are dropped. */
export function tableToTsv(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((row) =>
      Array.from(row.cells)
        .map((cell) => (cell.textContent ?? '').replace(/\s*[▲▼]\s*$/, '').replace(/[\t\n]+/g, ' ').trim())
        .join('\t'),
    )
    .join('\n')
}
