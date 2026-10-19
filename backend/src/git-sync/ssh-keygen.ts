// SshKeyGenerator — thin wrapper around the native `ssh-keygen` binary.
//
// Lets git-sync generate an ed25519 keypair server-side (so the private key
// never has to be typed/pasted by hand — the class of error that produced
// the "error in libcrypto: unsupported" incident) and derive the public key
// from any private key already on file, so it can be shown in the UI for
// copying into GitHub as a deploy key, even for a manually pasted key.
//
// Security notes: same as git-cli.ts — execFile with an argument array (never
// a shell string), private key material only ever touches a per-call temp
// file (mode 0600) removed in a `finally` block.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { GitCommandFailedError } from './errors.js'

const execFileAsync = promisify(execFile)
const SSH_KEYGEN_TIMEOUT_MS = 30 * 1000
const ICACLS_TIMEOUT_MS = 10 * 1000

export interface ISshKeyGenerator {
  /** Generates a new passphrase-less ed25519 keypair. Not persisted anywhere by this call. */
  generateKeyPair(comment: string): Promise<{ privateKey: string; publicKey: string }>
  /** Derives the public key line from an existing private key (any format `ssh-keygen -y` accepts). Throws if the key is malformed. */
  derivePublicKey(privateKey: string): Promise<string>
}

export class SshKeyGenerator implements ISshKeyGenerator {
  async generateKeyPair(comment: string): Promise<{ privateKey: string; publicKey: string }> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'slatebase-ssh-keygen-'))
    try {
      const keyPath = join(tmpDir, 'id_key')
      await this.run(['-t', 'ed25519', '-N', '', '-C', comment, '-f', keyPath])
      const [privateKey, publicKey] = await Promise.all([
        readFile(keyPath, 'utf-8'),
        readFile(`${keyPath}.pub`, 'utf-8'),
      ])
      return { privateKey, publicKey: publicKey.trim() }
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  async derivePublicKey(privateKey: string): Promise<string> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'slatebase-ssh-keygen-'))
    try {
      const keyPath = join(tmpDir, 'id_key')
      const normalizedKey = privateKey.replace(/\r\n/g, '\n')
      const keyContent = normalizedKey.endsWith('\n') ? normalizedKey : `${normalizedKey}\n`
      await writeFile(keyPath, keyContent, { mode: 0o600 })
      await this.restrictKeyPermissions(keyPath)
      const { stdout } = await this.run(['-y', '-f', keyPath])
      return stdout.trim()
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }

  /**
   * Restricts the temp key file so OpenSSH accepts it. On POSIX the file mode
   * (0o600) already satisfies ssh-keygen's permission check and this is a
   * no-op. On Windows the Node file mode is ignored and OpenSSH inspects the
   * NTFS ACL instead, rejecting the `OWNER RIGHTS` (S-1-3-4) entry the file
   * inherits from the temp directory with "Bad permissions". `icacls` strips
   * inheritance and grants only the current user, which clears that check.
   * Fails soft: if icacls errors, the subsequent ssh-keygen call still runs
   * and surfaces the real error.
   */
  private async restrictKeyPermissions(keyPath: string): Promise<void> {
    if (process.platform !== 'win32') return
    try {
      const user = userInfo().username
      await execFileAsync('icacls', [keyPath, '/inheritance:r', '/grant:r', `${user}:F`], {
        timeout: ICACLS_TIMEOUT_MS,
      })
    } catch {
      // Best-effort: let ssh-keygen report the authoritative failure.
    }
  }

  private async run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync('ssh-keygen', args, { timeout: SSH_KEYGEN_TIMEOUT_MS })
    } catch (error) {
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : String(error)
      throw new GitCommandFailedError(['ssh-keygen', ...args], stderr)
    }
  }
}
