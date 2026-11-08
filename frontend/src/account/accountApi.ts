/**
 * Client for the account endpoints: capability probe, password reset by mail,
 * address confirmation, passkeys and the admin account settings.
 *
 * Kept apart from ApiClient on purpose: most of these calls run before a session
 * exists (login page, mailed links), and the rest only need the CSRF token.
 */

import type { LoginResponse } from '../api'

export interface AccountApiError {
  code: string
  message: string
  retryAfter?: number
}

export interface AuthCapabilities {
  passwordReset: boolean
  passkey: boolean
}

export interface PasskeyInfo {
  id: string
  name: string
  rpId: string
  createdAt: string
  lastUsedAt: string | null
  transports: string[]
}

export interface SecurityOverview {
  email: string
  emailVerified: boolean
  pendingEmail: string | null
  passkeys: PasskeyInfo[]
  mailAvailable: boolean
}

export interface SmtpSettings {
  host: string
  port: number
  encryption: 'tls' | 'starttls' | 'none'
  username: string
  from: string
}

export interface AccountSettingsView {
  smtp: SmtpSettings
  mailBaseUrl: string
  passkeyRpId: string
  smtpPasswordSet: boolean
  resolvedMailBaseUrl: string | null
  allowedOrigins: string[]
}

export interface AccountSettingsUpdate {
  smtp: SmtpSettings
  mailBaseUrl: string
  passkeyRpId: string
  /** undefined = keep, '' = remove */
  smtpPassword?: string
}

/** Challenge plus WebAuthn options as returned by the passkey ceremony endpoints. */
export interface PasskeyCeremony<TOptions> {
  challengeId: string
  options: TOptions
}

async function toError(response: Response): Promise<AccountApiError> {
  let body: { code?: string; message?: string } = {}
  try {
    body = (await response.json()) as { code?: string; message?: string }
  } catch {
    // no JSON body
  }
  const retryAfter = Number(response.headers.get('Retry-After'))
  return {
    code: body.code ?? 'INTERNAL_ERROR',
    message: body.message ?? `Request failed with status ${String(response.status)}`,
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
  }
}

export function createAccountApi(getCsrfToken: () => string | null = () => null) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    const csrf = getCsrfToken()
    if (csrf !== null && method !== 'GET') headers['X-CSRF-Token'] = csrf
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const init: RequestInit = { method, headers }
    if (body !== undefined) init.body = JSON.stringify(body)
    const response = await fetch(path, init)
    if (!response.ok) throw await toError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    // ─── Public ──────────────────────────────────────────────────────────
    getCapabilities: () =>
      call<AuthCapabilities>('GET', `/api/v1/auth/capabilities?origin=${encodeURIComponent(window.location.origin)}`),
    requestPasswordReset: (identifier: string) => call<{ ok: true }>('POST', '/api/v1/auth/password-reset/request', { identifier }),
    confirmPasswordReset: (token: string, password: string) =>
      call<void>('POST', '/api/v1/auth/password-reset/confirm', { token, password }),
    verifyEmail: (token: string) => call<void>('POST', '/api/v1/auth/email/verify', { token }),
    passkeyLoginOptions: <T>() => call<PasskeyCeremony<T>>('POST', '/api/v1/auth/passkey/login/options', {}),
    passkeyLoginVerify: (challengeId: string, response: unknown) =>
      call<LoginResponse>('POST', '/api/v1/auth/passkey/login/verify', { challengeId, response }),

    // ─── Signed in ───────────────────────────────────────────────────────
    getSecurity: () => call<SecurityOverview>('GET', '/api/v1/users/me/security'),
    requestEmailChange: (email: string, password: string) => call<{ ok: true }>('PUT', '/api/v1/users/me/email', { email, password }),
    passkeyRegisterOptions: <T>(password: string) =>
      call<PasskeyCeremony<T>>('POST', '/api/v1/auth/passkey/register/options', { password }),
    passkeyRegisterVerify: (challengeId: string, name: string, response: unknown) =>
      call<PasskeyInfo>('POST', '/api/v1/auth/passkey/register/verify', { challengeId, name, response }),
    renamePasskey: (id: string, name: string) => call<PasskeyInfo>('PUT', `/api/v1/users/me/passkeys/${encodeURIComponent(id)}`, { name }),
    deletePasskey: (id: string) => call<void>('DELETE', `/api/v1/users/me/passkeys/${encodeURIComponent(id)}`),

    // ─── Admin ───────────────────────────────────────────────────────────
    getAccountSettings: () => call<AccountSettingsView>('GET', '/api/v1/admin/account-settings'),
    updateAccountSettings: (update: AccountSettingsUpdate) => call<AccountSettingsView>('PUT', '/api/v1/admin/account-settings', update),
    sendTestMail: (to: string) => call<{ ok: true }>('POST', '/api/v1/admin/account-settings/test', { to }),
    removeUserPasskeys: (userId: string) =>
      call<{ removed: number }>('DELETE', `/api/v1/admin/users/${encodeURIComponent(userId)}/passkeys`),
  }
}

export type AccountApi = ReturnType<typeof createAccountApi>

/** Reads `#token=...` from a URL fragment (never sent to the server or to logs). */
export function readFragmentToken(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const token = params.get('token')
  return token !== null && token !== '' ? token : null
}
