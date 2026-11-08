// MailService — outgoing mail over the admin-configured SMTP server.

import nodemailer from 'nodemailer'
import type { ILogger } from '../logger/index.js'
import type { IAccountSettingsStore } from './settings-store.js'

export interface OutgoingMail {
  to: string
  subject: string
  text: string
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super('SMTP is not configured')
    this.name = 'MailNotConfiguredError'
  }
}

export interface IMailService {
  /** True if host and sender are set (the minimum to attempt delivery). */
  isConfigured(): Promise<boolean>
  send(mail: OutgoingMail): Promise<void>
}

const SEND_TIMEOUT_MS = 15_000

export class MailService implements IMailService {
  constructor(
    private readonly settings: IAccountSettingsStore,
    private readonly logger: ILogger,
  ) {}

  async isConfigured(): Promise<boolean> {
    const { smtp } = await this.settings.get()
    return smtp.host !== '' && smtp.from !== ''
  }

  async send(mail: OutgoingMail): Promise<void> {
    const { smtp } = await this.settings.get()
    if (smtp.host === '' || smtp.from === '') {
      throw new MailNotConfiguredError()
    }
    const password = await this.settings.getSmtpPassword()
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.encryption === 'tls',
      requireTLS: smtp.encryption === 'starttls',
      ignoreTLS: smtp.encryption === 'none',
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
      ...(smtp.username !== '' ? { auth: { user: smtp.username, pass: password ?? '' } } : {}),
    })
    try {
      await transport.sendMail({ from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text })
    } finally {
      transport.close()
    }
    this.logger.info('Mail sent', { subject: mail.subject })
  }
}
