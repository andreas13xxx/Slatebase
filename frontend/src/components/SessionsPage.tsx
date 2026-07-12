import { useEffect, useState } from 'react'
import type { IApiClient, SessionInfo } from '../api'
import { useTranslation } from '../i18n'
import { Monitor, LogOut, RefreshCw } from 'lucide-react'
import { extractErrorMessage } from '../utils/error'

export interface SessionsPageProps {
  apiClient: IApiClient
}

function findCurrentSessionId(sessions: SessionInfo[]): string | null {
  if (sessions.length === 0) return null
  let mostRecent = sessions[0]!
  for (const session of sessions) {
    if (session.createdAt > mostRecent.createdAt) mostRecent = session
  }
  return mostRecent.sessionId
}

/**
 * Session management page — redesigned with modern card layout.
 */
export function SessionsPage({ apiClient }: SessionsPageProps) {
  const { t, locale } = useTranslation()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  function formatDateTime(isoString: string): string {
    return new Date(isoString).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function loadSessions(): Promise<void> {
    setIsLoading(true)
    setError(null)
    try {
      setSessions(await apiClient.getSessions())
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('sessions.loadError')))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadSessions() }, []) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  async function handleInvalidate(sessionId: string): Promise<void> {
    setPendingAction(sessionId)
    setError(null)
    try {
      await apiClient.invalidateSession(sessionId)
      await loadSessions()
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('sessions.invalidateError')))
    } finally { setPendingAction(null) }
  }

  async function handleInvalidateAll(): Promise<void> {
    setPendingAction('all-other')
    setError(null)
    try {
      await apiClient.invalidateAllOtherSessions()
      await loadSessions()
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('sessions.invalidateAllError')))
    } finally { setPendingAction(null) }
  }

  const currentSessionId = findCurrentSessionId(sessions)
  const hasOtherSessions = sessions.filter((s) => s.sessionId !== currentSessionId).length > 0

  return (
    <div className="sessions-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 className="sessions-title" style={{ margin: 0 }}>{t('sessions.title')}</h1>
        <button
          className="sessions-revoke-btn"
          style={{ marginLeft: 'auto', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          onClick={() => void loadSessions()}
          disabled={isLoading}
          title={t('sessions.refresh')}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {error && <p className="sessions-error" role="alert">{error}</p>}

      {isLoading ? (
        <p className="sessions-loading">{t('sessions.loading')}</p>
      ) : sessions.length === 0 ? (
        <p className="sessions-empty">{t('sessions.empty')}</p>
      ) : (
        <>
          <ul className="sessions-list" aria-label={t('sessions.ariaLabel')}>
            {sessions.map((session) => {
              const isCurrent = session.sessionId === currentSessionId
              return (
                <li key={session.sessionId} className={`sessions-item${isCurrent ? ' sessions-item--current' : ''}`}>
                  <Monitor size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div className="sessions-item-info">
                    <div className="sessions-item-agent" title={session.userAgent}>
                      {session.userAgent.length > 60 ? session.userAgent.slice(0, 60) + '…' : session.userAgent}
                    </div>
                    <div className="sessions-item-meta">
                      IP: {session.ipAddress} · {t('sessions.created')}: {formatDateTime(session.createdAt)} · {t('sessions.active')}: {formatDateTime(session.lastActivity)}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="sessions-current-badge">{t('sessions.currentSession')}</span>
                  ) : (
                    <button
                      className="sessions-revoke-btn"
                      onClick={() => void handleInvalidate(session.sessionId)}
                      disabled={pendingAction !== null}
                      aria-label={t('sessions.endSessionAriaLabel')}
                    >
                      {pendingAction === session.sessionId ? t('sessions.endingSession') : t('sessions.endSession')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {hasOtherSessions && (
            <button
              className="sessions-revoke-all-btn"
              onClick={() => void handleInvalidateAll()}
              disabled={pendingAction !== null}
            >
              <LogOut size={14} />
              {pendingAction === 'all-other' ? t('sessions.endingAllOther') : t('sessions.endAllOther')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
