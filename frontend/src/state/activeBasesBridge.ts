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

  /**
   * Download the displayed table as a CSV file (UTF-8 with BOM, so a spreadsheet reads umlauts
   * correctly). @returns false when no table is displayed.
   */
  exportCsv(): boolean

  /**
   * Create a new note in the base's scope (target folder from a `file.inFolder`
   * filter, else vault root; frontmatter keys from the displayed properties,
   * left blank) so it appears as a new row. @returns the new note's path, or
   * null when the base is unparsable or the note could not be created.
   */
  addItem(): Promise<string | null>
}

let activeController: ActiveBasesController | null = null

/** Registers/clears the active base controller. Called by BasesView on mount/unmount. */
export function setActiveBasesController(controller: ActiveBasesController | null): void {
  activeController = controller
}

/**
 * Clears the active controller ONLY if `controller` is still the registered
 * one. With Split Panes two BasesView instances can be mounted at once; the
 * last to mount owns the slot, and an unconditional clear on the other's
 * unmount would null a slot it no longer owns (the `bases:*` commands would
 * then report "no base open" while one is visibly active). An unmounting
 * instance passes its own identity so it clears only its own registration.
 */
export function clearActiveBasesController(controller: ActiveBasesController): void {
  if (activeController === controller) activeController = null
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

/** Cleans one displayed cell: sort markers dropped, whitespace collapsed. */
function cellText(cell: HTMLTableCellElement): string {
  return (cell.textContent ?? '').replace(/\s*[▲▼]\s*$/, '').replace(/\s+/g, ' ').trim()
}

/**
 * Makes a cell safe to open in a spreadsheet: a text starting with `=`, `+`, `@` (or `-` unless the
 * whole text is a plain negative number) would be run as a formula, and a note in a shared vault
 * controls that text. Such cells get a leading apostrophe, which spreadsheets show as plain text.
 */
export function neutralizeSpreadsheetFormula(text: string): string {
  // A leading "-" stays only for a plain negative number ("-5", "-0,5") or a lone dash.
  if (/^[=+@]/.test(text) || /^-(?!\d[\d.,]*$|$)/.test(text)) return `'${text}`
  return text
}

/** One CSV field (RFC 4180): quoted when it holds a comma, quote or line break; quotes are doubled. */
function csvField(text: string): string {
  const safe = neutralizeSpreadsheetFormula(text)
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Render an HTML table as CSV (RFC 4180, CRLF line ends). Sort markers are dropped. */
export function tableToCsv(table: HTMLTableElement): string {
  return Array.from(table.rows)
    .map((row) => Array.from(row.cells).map((cell) => csvField(cellText(cell))).join(','))
    .join('\r\n')
}

/** File name for a base's CSV export: the base's own name with `.csv` (`Tasks.base` becomes `Tasks.csv`). */
export function csvFileName(hostPath: string | undefined): string {
  const name = (hostPath ?? '').split('/').pop() ?? ''
  const base = name.replace(/\.base$/i, '').trim()
  return `${base || 'base'}.csv`
}
