import { useEffect, useState } from 'react'
import type { IApiClient, SessionInfo } from '../api'

/** Props for the SessionsPage component. */
export interface SessionsPageProps {
  /** API client instance for session management requests. */
  apiClient: IApiClient
}

/**
 * Determines the most recently created session as the "current" session.
 * Since the LoginResponse does not include a sessionId, we use the most
 * recent createdAt timestamp as a heuristic to identify the current session.
 */
function findCurrentSessionId(sessions: SessionInfo[]): string | null {
  if (sessions.length === 0) return null
  let mostRecent = sessions[0]!
  for (const session of sessions) {
    if (session.createdAt > mostRecent.createdAt) {
      mostRecent = session
    }
  }
  return mostRecent.sessionId
}

/**
 * Formats an ISO 8601 date string to a localized German date/time string.
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Session management page displaying all active sessions for the current user.
 * Allows invalidating individual sessions or all other sessions.
 * Highlights the current session based on the most recent creation time.
 */
export function SessionsPage({ apiClient }: SessionsPageProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  /** Loads the list of active sessions from the API. */
  async function loadSessions(): Promise<void> {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiClient.getSessions()
      setSessions(result)
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message)
      } else {
        setError('Sitzungen konnten nicht geladen werden.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Invalidates a single session by ID and refreshes the list. */
  async function handleInvalidateSession(sessionId: string): Promise<void> {
    setPendingAction(sessionId)
    setError(null)
    try {
      await apiClient.invalidateSession(sessionId)
      await loadSessions()
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message)
      } else {
        setError('Sitzung konnte nicht beendet werden.')
      }
    } finally {
      setPendingAction(null)
    }
  }

  /** Invalidates all sessions except the current one and refreshes the list. */
  async function handleInvalidateAllOther(): Promise<void> {
    setPendingAction('all-other')
    setError(null)
    try {
      await apiClient.invalidateAllOtherSessions()
      await loadSessions()
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message)
      } else {
        setError('Sitzungen konnten nicht beendet werden.')
      }
    } finally {
      setPendingAction(null)
    }
  }

  const currentSessionId = findCurrentSessionId(sessions)
  const hasOtherSessions = sessions.length > 1

  if (isLoading) {
    return (
      <div className="sessions-page">
        <h1 className="sessions-title">Aktive Sitzungen</h1>
        <p className="sessions-loading">Laden…</p>
      </div>
    )
  }

  return (
    <div className="sessions-page">
      <h1 className="sessions-title">Aktive Sitzungen</h1>

      {error && (
        <p className="sessions-error" role="alert">
          {error}
        </p>
      )}

      {sessions.length === 0 && !error && (
        <p className="sessions-empty">Keine aktiven Sitzungen gefunden.</p>
      )}

      {sessions.length > 0 && (
        <>
          <ul className="sessions-list" aria-label="Aktive Sitzungen">
            {sessions.map((session) => {
              const isCurrent = session.sessionId === currentSessionId
              return (
                <li
                  key={session.sessionId}
                  className={`sessions-item${isCurrent ? ' sessions-item--current' : ''}`}
                >
                  <div className="sessions-item-info">
                    <span className="sessions-item-device">
                      {session.userAgent}
                    </span>
                    {isCurrent && (
                      <span className="sessions-item-badge">Aktuelle Sitzung</span>
                    )}
                    <span className="sessions-item-meta">
                      Letzte Aktivität: {formatDateTime(session.lastActivity)}
                    </span>
                    <span className="sessions-item-meta">
                      Erstellt am: {formatDateTime(session.createdAt)}
                    </span>
                  </div>
                  {!isCurrent && (
                    <button
                      className="sessions-item-action"
                      onClick={() => void handleInvalidateSession(session.sessionId)}
                      disabled={pendingAction !== null}
                      aria-label={`Sitzung beenden: ${session.userAgent}`}
                    >
                      {pendingAction === session.sessionId ? 'Beenden…' : 'Beenden'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {hasOtherSessions && (
            <button
              className="sessions-invalidate-all"
              onClick={() => void handleInvalidateAllOther()}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'all-other' ? 'Alle anderen beenden…' : 'Alle anderen beenden'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
