// AccountSettingsStore — admin-managed settings for mail recovery and passkeys.
//
// `data/account/settings.json` holds the non-secret values; the SMTP password
// lives in the shared encrypted ModuleSecretStore (never in this file, never
// returned by the API).

import { join } from 'node:path'
import { z } from 'zod'
import { JsonFileStore } from '../shared/json-file-store.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'

const SECRET_VAULT = '_server'
const SECRET_MODULE = 'account'
const SECRET_ENTRY = 'smtp-password'

export const smtpSettingsSchema = z.object({
  host: z.string().trim().max(253),
  port: z.number().int().min(1).max(65535),
  /** `tls` = implicit TLS (465), `starttls` = upgrade on 587, `none` = plain (trusted LAN only). */
  encryption: z.enum(['tls', 'starttls', 'none']),
  username: z.string().max(254),
  from: z.string().trim().max(254),
})

export type SmtpSettings = z.infer<typeof smtpSettingsSchema>

export interface AccountSettings {
  smtp: SmtpSettings
  /** Base URL used in mailed links. Must be one of `allowedOrigins`; empty = first HTTPS origin. */
  mailBaseUrl: string
  /** Shared WebAuthn relying-party id (parent domain); empty = hostname of the request origin. */
  passkeyRpId: string
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  smtp: { host: '', port: 587, encryption: 'starttls', username: '', from: '' },
  mailBaseUrl: '',
  passkeyRpId: '',
}

const accountSettingsSchema = z.object({
  smtp: smtpSettingsSchema,
  mailBaseUrl: z.string().max(2048),
  passkeyRpId: z.string().max(253),
})

export interface IAccountSettingsStore {
  get(): Promise<AccountSettings>
  /** Replaces the settings. `smtpPassword`: undefined = keep, '' = clear, otherwise set. */
  update(settings: AccountSettings, smtpPassword?: string): Promise<void>
  getSmtpPassword(): Promise<string | null>
  hasSmtpPassword(): Promise<boolean>
}

export class AccountSettingsStore implements IAccountSettingsStore {
  private readonly store: JsonFileStore<AccountSettings>

  constructor(
    dataDir: string,
    private readonly secrets: IModuleSecretStore,
  ) {
    this.store = new JsonFileStore<AccountSettings>(
      join(dataDir, 'account', 'settings.json'),
      DEFAULT_ACCOUNT_SETTINGS,
      (raw) => {
        const parsed = accountSettingsSchema.safeParse(raw)
        return parsed.success ? parsed.data : null
      },
    )
  }

  async get(): Promise<AccountSettings> {
    return this.store.read()
  }

  async update(settings: AccountSettings, smtpPassword?: string): Promise<void> {
    await this.store.write(settings)
    if (smtpPassword === undefined) return
    if (smtpPassword === '') {
      await this.secrets.deleteSecret(SECRET_VAULT, SECRET_MODULE, SECRET_ENTRY)
    } else {
      await this.secrets.setSecret(SECRET_VAULT, SECRET_MODULE, SECRET_ENTRY, smtpPassword)
    }
  }

  async getSmtpPassword(): Promise<string | null> {
    return this.secrets.getSecret(SECRET_VAULT, SECRET_MODULE, SECRET_ENTRY)
  }

  async hasSmtpPassword(): Promise<boolean> {
    return (await this.getSmtpPassword()) !== null
  }
}
