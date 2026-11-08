/**
 * Browser side of the passkey ceremonies, wrapping @simplewebauthn/browser.
 */

import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import type { LoginResponse } from '../api'
import type { AccountApi, PasskeyInfo } from './accountApi'

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn()
}

export async function isPasskeyAutofillSupported(): Promise<boolean> {
  return browserSupportsWebAuthnAutofill()
}

/** Cancels a pending passkey prompt (for example the autofill request when the user types a password). */
export function cancelPasskeyPrompt(): void {
  WebAuthnAbortService.cancelCeremony()
}

/** True if the error means the user dismissed the browser prompt rather than a real failure. */
export function isPasskeyCancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')
}

/**
 * Signs in with a discoverable passkey. With `autofill`, the request stays pending
 * until the user picks a passkey from the browser's username-field suggestions.
 */
export async function signInWithPasskey(api: AccountApi, autofill = false): Promise<LoginResponse> {
  const { challengeId, options } = await api.passkeyLoginOptions<PublicKeyCredentialRequestOptionsJSON>()
  const assertion = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill })
  return api.passkeyLoginVerify(challengeId, assertion)
}

/** Registers a new passkey for the signed-in user (re-authenticated with the password). */
export async function registerPasskey(api: AccountApi, password: string, name: string): Promise<PasskeyInfo> {
  const { challengeId, options } = await api.passkeyRegisterOptions<PublicKeyCredentialCreationOptionsJSON>(password)
  const attestation = await startRegistration({ optionsJSON: options })
  return api.passkeyRegisterVerify(challengeId, name, attestation)
}

/** A readable default name from the user agent, shown as the suggestion for a new passkey. */
export function suggestPasskeyName(userAgent: string = navigator.userAgent): string {
  const os = /Windows/i.test(userAgent) ? 'Windows'
    : /iPhone|iPad/i.test(userAgent) ? 'iOS'
    : /Android/i.test(userAgent) ? 'Android'
    : /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS'
    : /Linux/i.test(userAgent) ? 'Linux'
    : 'Gerät'
  const browser = /Edg\//i.test(userAgent) ? 'Edge'
    : /Firefox\//i.test(userAgent) ? 'Firefox'
    : /Chrome\//i.test(userAgent) ? 'Chrome'
    : /Safari\//i.test(userAgent) ? 'Safari'
    : ''
  return browser === '' ? os : `${os} · ${browser}`
}
