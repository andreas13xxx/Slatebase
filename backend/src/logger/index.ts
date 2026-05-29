// Logger module — pino-based structured logging with optional file persistence

import pino from 'pino'
import type { IConfigService } from '../config/index.js'
import type { IServerLogStore, LogLevel } from './log-store.js'

// --- Interface ---

export interface ILogger {
  debug(message: string, meta?: object): void
  info(message: string, meta?: object): void
  warn(message: string, meta?: object): void
  error(message: string, meta?: object): void
}

// --- Implementation ---

export class AppLogger implements ILogger {
  private readonly logger: pino.Logger
  private logStore: IServerLogStore | undefined

  constructor(config: IConfigService) {
    const { logLevel } = config.getServerConfig()
    this.logger = pino({ level: logLevel })
  }

  /**
   * Attaches a log store for file persistence.
   * Called after the log store is created in the composition root.
   */
  setLogStore(logStore: IServerLogStore): void {
    this.logStore = logStore
  }

  debug(message: string, meta?: object): void {
    if (meta) {
      this.logger.debug(meta, message)
    } else {
      this.logger.debug(message)
    }
    this.persistEntry('debug', message, meta)
  }

  info(message: string, meta?: object): void {
    if (meta) {
      this.logger.info(meta, message)
    } else {
      this.logger.info(message)
    }
    this.persistEntry('info', message, meta)
  }

  warn(message: string, meta?: object): void {
    if (meta) {
      this.logger.warn(meta, message)
    } else {
      this.logger.warn(message)
    }
    this.persistEntry('warn', message, meta)
  }

  error(message: string, meta?: object): void {
    if (meta) {
      this.logger.error(meta, message)
    } else {
      this.logger.error(message)
    }
    this.persistEntry('error', message, meta)
  }

  /**
   * Persists a log entry to the file store (fire-and-forget).
   * Errors during persistence are silently ignored to avoid recursive logging.
   */
  private persistEntry(level: LogLevel, message: string, meta?: object): void {
    if (!this.logStore) return

    const entry: { timestamp: string; level: LogLevel; message: string; meta?: Record<string, unknown> } = {
      timestamp: new Date().toISOString(),
      level,
      message,
    }

    if (meta !== undefined) {
      entry.meta = meta as Record<string, unknown>
    }

    this.logStore.append(entry).catch(() => {
      // Silently ignore persistence errors to avoid infinite recursion
    })
  }
}

// --- Factory ---

export function createLogger(config: IConfigService): AppLogger {
  return new AppLogger(config)
}

// --- Re-exports ---

export type { IServerLogStore, LogLevel, LogEntry, LogFilter, PaginatedLogResult } from './log-store.js'
export { ServerLogStore } from './log-store.js'
