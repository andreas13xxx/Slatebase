import { useCallback, useEffect, useRef, useState } from 'react'
import { showToast } from '../components/ToastNotification'
import { useTranslation } from '../i18n'
import { protocolHandlerOwner, runProtocolHandler } from '../plugins/compat/protocol-handlers'
import { consumeInvalidProtocolAction, consumePendingProtocolAction, type ProtocolActionRequest } from './protocolAction'

/** How long a link waits for a plugin to register its handler (plugins load after the vault opens). */
export const PROTOCOL_ACTION_WAIT_MS = 30_000

const POLL_MS = 250

/** A link waiting for the user's yes: which plugin would run, and with what. */
export interface ProtocolActionPrompt {
  pluginId: string
  request: ProtocolActionRequest
}

export interface UseProtocolAction {
  /** Set while the user has to confirm; render a confirmation for it. */
  prompt: ProtocolActionPrompt | null
  /** The user agreed: runs the plugin's handler. */
  confirm: () => void
  /** The user declined: drops the link. */
  cancel: () => void
}

/**
 * Picks up the `/obsidian?action=…` link the user arrived with, once the signed-in app is up, and
 * asks before any plugin code runs: a link can be sent by anyone, so opening one is not consent.
 * A link nobody handles within {@link PROTOCOL_ACTION_WAIT_MS} ends in a toast.
 */
export function useProtocolAction(): UseProtocolAction {
  const { t } = useTranslation()
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t })
  const [request, setRequest] = useState<ProtocolActionRequest | null>(null)
  const [prompt, setPrompt] = useState<ProtocolActionPrompt | null>(null)

  // Consumed in an effect (not a state initializer) so StrictMode's second run finds nothing left.
  useEffect(() => {
    if (consumeInvalidProtocolAction()) showToast('error', tRef.current('deepLink.invalid'))
    const pending = consumePendingProtocolAction()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pending) setRequest(pending)
  }, [])

  // Wait for the handler: it appears once the plugin that owns it has loaded.
  useEffect(() => {
    if (!request) return
    const started = Date.now()
    const timer = setInterval(() => {
      const owner = protocolHandlerOwner(request.action)
      if (owner !== null) {
        clearInterval(timer)
        setPrompt({ pluginId: owner, request })
        setRequest(null)
      } else if (Date.now() - started > PROTOCOL_ACTION_WAIT_MS) {
        clearInterval(timer)
        showToast('error', tRef.current('deepLink.protocolNoHandler'))
        setRequest(null)
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [request])

  const confirm = useCallback(() => {
    const current = prompt
    setPrompt(null)
    if (!current) return
    void runProtocolHandler(current.request.action, current.request.params).then((ran) => {
      if (!ran) showToast('error', tRef.current('deepLink.protocolNoHandler'))
    })
  }, [prompt])

  const cancel = useCallback(() => setPrompt(null), [])

  return { prompt, confirm, cancel }
}
