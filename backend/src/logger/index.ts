// Logger module — pino-based structured logging

import pino from 'pino'
import type { IConfigService } from '../config/index.js'

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

  constructor(config: IConfigService) {
    const { logLevel } = config.getServerConfig()
    this.logger = pino({ level: logLevel })
  }

  debug(message: string, meta?: object): void {
    if (meta) {
      this.logger.debug(meta, message)
    } else {
      this.logger.debug(message)
    }
  }

  info(message: string, meta?: object): void {
    if (meta) {
      this.logger.info(meta, message)
    } else {
      this.logger.info(message)
    }
  }

  warn(message: string, meta?: object): void {
    if (meta) {
      this.logger.warn(meta, message)
    } else {
      this.logger.warn(message)
    }
  }

  error(message: string, meta?: object): void {
    if (meta) {
      this.logger.error(meta, message)
    } else {
      this.logger.error(message)
    }
  }
}

// --- Factory ---

export function createLogger(config: IConfigService): ILogger {
  return new AppLogger(config)
}
