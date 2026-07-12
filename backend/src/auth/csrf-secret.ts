import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ILogger } from '../logger/index.js'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Manages the CSRF secret used for HMAC-based CSRF token generation.
 * Ensures the secret persists across backend restarts.
 */
export interface ICsrfSecretManager {
  /** Load the CSRF secret (from env, file, or generate + persist). */
  loadOrCreate(): Promise<string>
}

// ─── Implementation ──────────────────────────────────────────────────────────

const CSRF_SECRET_FILE = '.csrf-secret'
const CSRF_SECRET_ENV_VAR = 'SLATEBASE_CSRF_SECRET'
const SECRET_LENGTH_BYTES = 32

/**
 * Loads or generates and persists a stable CSRF secret across backend restarts.
 *
 * Priority order:
 * 1. Environment variable `SLATEBASE_CSRF_SECRET`
 * 2. File at `{dataDir}/.csrf-secret`
 * 3. Generate new 32-byte hex secret, write atomically, return
 */
export class CsrfSecretManager implements ICsrfSecretManager {
  private readonly secretPath: string

  constructor(
    private readonly dataDir: string,
    private readonly logger: ILogger
  ) {
    this.secretPath = join(this.dataDir, CSRF_SECRET_FILE)
  }

  /** Load the CSRF secret (from env, file, or generate + persist). */
  async loadOrCreate(): Promise<string> {
    // 1. Check environment variable
    const envSecret = process.env[CSRF_SECRET_ENV_VAR]
    if (envSecret && envSecret.length > 0) {
      this.logger.info('CSRF secret loaded from environment variable')
      return envSecret
    }

    // 2. Try reading from file
    try {
      const fileContent = await readFile(this.secretPath, 'utf-8')
      const secret = fileContent.trim()
      if (this.isValidSecret(secret)) {
        this.logger.info('CSRF secret loaded from file')
        return secret
      }
      // File exists but content is corrupted/invalid — regenerate
      this.logger.warn('CSRF secret file is corrupted, regenerating')
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === 'ENOENT') {
        this.logger.info('CSRF secret file not found, generating new secret')
      } else {
        this.logger.warn('Failed to read CSRF secret file, regenerating')
      }
    }

    // 3. Generate new secret and persist atomically
    const newSecret = randomBytes(SECRET_LENGTH_BYTES).toString('hex')
    await this.persistSecret(newSecret)
    this.logger.warn(
      'New CSRF secret generated — all existing sessions are invalidated. ' +
      'Set SLATEBASE_CSRF_SECRET env var or mount a persistent volume for the data directory to prevent session loss on restart.'
    )
    return newSecret
  }

  /**
   * Validates that a secret string is a valid 64-character hex string (32 bytes).
   */
  private isValidSecret(secret: string): boolean {
    return /^[0-9a-f]{64}$/i.test(secret)
  }

  /**
   * Writes the secret to disk using the atomic write pattern (temp → rename).
   */
  private async persistSecret(secret: string): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    const tempPath = `${this.secretPath}.${randomBytes(8).toString('hex')}.tmp`
    await writeFile(tempPath, secret, 'utf-8')
    await rename(tempPath, this.secretPath)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
