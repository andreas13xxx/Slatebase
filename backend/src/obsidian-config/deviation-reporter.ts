// Reports where a real `.obsidian/` file differs from what Slatebase assumes (unknown key, value
// outside an enum, wrong type, unexpected structure). Only logs: the file is never touched and the
// caller falls back to its default. Each deviation is reported once per process; a changed value is
// a new deviation because the value is part of the reason.

import type { ILogger } from '../logger/index.js'

/** After this many distinct deviations nothing new is logged, so a broken vault cannot flood the log. */
const MAX_REMEMBERED = 5000

export interface ConfigDeviation {
  /** Path inside the JSON file, e.g. `newLinkFormat` or `items.2.type`. Values in `reason` are already shortened by the caller (80 characters). */
  path: string
  reason: string
}

export interface IDeviationReporter {
  report(vaultId: string, file: string, deviations: readonly ConfigDeviation[]): void
}

export class DeviationReporter implements IDeviationReporter {
  private readonly seen = new Set<string>()

  constructor(private readonly logger: ILogger) {}

  report(vaultId: string, file: string, deviations: readonly ConfigDeviation[]): void {
    for (const deviation of deviations) {
      const id = `${vaultId}\0${file}\0${deviation.path}\0${deviation.reason}`
      if (this.seen.has(id)) continue
      if (this.seen.size >= MAX_REMEMBERED) return
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
