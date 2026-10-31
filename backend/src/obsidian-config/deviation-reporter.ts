// Reports where a real `.obsidian/` file differs from what Slatebase assumes (unknown key, value
// outside an enum, wrong type, unexpected structure). Only logs: the file is never touched and the
// caller falls back to its default. Each deviation is reported once per process; a changed value is
// a new deviation because the value is part of the reason.

import type { ILogger } from '../logger/index.js'

const MAX_REMEMBERED = 5000
/** Longest value shown in a message. Config values only — note content never reaches this module. */
const MAX_VALUE_LENGTH = 80

export interface ConfigDeviation {
  /** Path inside the JSON file, e.g. `newLinkFormat` or `items.2.type`. */
  path: string
  reason: string
}

export interface IDeviationReporter {
  report(vaultId: string, file: string, deviations: readonly ConfigDeviation[]): void
}

/** Shortens a value for a log line. */
export function shortValue(value: unknown): string {
  const text = typeof value === 'string' ? JSON.stringify(value) : (JSON.stringify(value) ?? String(value))
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text
}

export class DeviationReporter implements IDeviationReporter {
  private readonly seen = new Set<string>()

  constructor(private readonly logger: ILogger) {}

  report(vaultId: string, file: string, deviations: readonly ConfigDeviation[]): void {
    for (const deviation of deviations) {
      const id = `${vaultId}\0${file}\0${deviation.path}\0${deviation.reason}`
      if (this.seen.has(id)) continue
      if (this.seen.size >= MAX_REMEMBERED) this.seen.clear()
      this.seen.add(id)
      this.logger.warn(`[obsidian-config] vault=${vaultId} file=${file} path=${deviation.path} ${deviation.reason}`, {
        vaultId,
        file,
        path: deviation.path,
      })
    }
  }
}

/** For callers that do not report (tests, one-off tools). */
export const noopDeviationReporter: IDeviationReporter = { report: () => undefined }
