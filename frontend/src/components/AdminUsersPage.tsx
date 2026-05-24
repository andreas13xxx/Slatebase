import { useState, useEffect, useCallback, type FormEvent } from 'react'
import type { IApiClient } from '../api'
import type { UserRole } from '../state/authState'

// ─── Types ───────────────────────────────────────────────────────────────────

/** User info as returned by the admin user list endpoint. */
interface AdminUserInfo {
  userId: string
  username: string
  displayName: string
  email: string
  role: UserRole
  suspended: boolean
  mustChangePassword: boolean
  createdAt: string
}

/** Paginated response from the admin users endpoint. */
interface PaginatedUsersResponse {
  items: AdminUserInfo[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Props for the AdminUsersPage component. */
export interface AdminUsersPageProps {
  /** API client instance for making authenticated requests. */
  apiClient: IApiClient
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Admin user management page.
 * Displays a paginated user list with actions to create, delete,
 * change role, reset password, and suspend/unsuspend users.
 * All labels are in German. Accepts apiClient as a prop.
 */
export function AdminUsersPage({ apiClient }: AdminUsersPageProps) {
  // ─── User list state ─────────────────────────────────────────────────────
  const [users, setUsers] = useState<AdminUserInfo[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  // ─── Create user form state ──────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('user')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  // ─── Action feedback state ───────────────────────────────────────────────
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // ─── Confirmation dialog state ───────────────────────────────────────────
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)

  // ─── Temporary password display ──────────────────────────────────────────
  const [tempPassword, setTempPassword] = useState<string | null>(null)

  const PAGE_SIZE = 20

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Makes an authenticated JSON request to the given API path.
   * Throws an object with { code, message } on error.
   */
  async function adminFetch<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {}

    const token = apiClient.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const csrfToken = apiClient.getCsrfToken()
    if (csrfToken && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
      headers['X-CSRF-Token'] = csrfToken
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(path, init)

    if (response.status === 204) {
      return undefined as T
    }

    const text = await response.text()
    const data = text ? JSON.parse(text) : undefined

    if (!response.ok) {
      const errorMessage = data?.message ?? `Anfrage fehlgeschlagen (Status ${response.status})`
      throw { code: data?.code ?? 'UNKNOWN', message: errorMessage }
    }

    return data as T
  }

  // ─── Load users ──────────────────────────────────────────────────────────

  const loadUsers = useCallback(async (targetPage: number) => {
    setListLoading(true)
    setListError(null)
    try {
      const result = await adminFetch<PaginatedUsersResponse>(
        'GET',
        `/api/v1/admin/users?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      )
      setUsers(result.items)
      setPage(result.page)
      setTotalPages(result.totalPages)
      setTotal(result.total)
    } catch (err: unknown) {
      const message = extractErrorMessage(err)
      setListError(message)
    } finally {
      setListLoading(false)
    }
  }, [apiClient])

  useEffect(() => {
    void loadUsers(1)
  }, [loadUsers])

  // ─── Create user ────────────────────────────────────────────────────────

  async function handleCreateUser(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setCreateError(null)
    setCreateSuccess(null)
    setCreateLoading(true)

    try {
      await adminFetch<AdminUserInfo>('POST', '/api/v1/admin/users', {
        username: newUsername,
        password: newPassword,
        role: newRole,
      })
      setCreateSuccess(`Benutzer „${newUsername}" wurde erstellt.`)
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      void loadUsers(page)
    } catch (err: unknown) {
      setCreateError(extractErrorMessage(err))
    } finally {
      setCreateLoading(false)
    }
  }

  // ─── User actions ───────────────────────────────────────────────────────

  function handleDeleteUser(user: AdminUserInfo): void {
    setConfirmDialog({
      message: `Benutzer „${user.username}" wirklich löschen?`,
      onConfirm: async () => {
        setConfirmDialog(null)
        setActionError(null)
        setActionSuccess(null)
        try {
          await adminFetch<void>('DELETE', `/api/v1/admin/users/${user.userId}`)
          setActionSuccess(`Benutzer „${user.username}" wurde gelöscht.`)
          void loadUsers(page)
        } catch (err: unknown) {
          setActionError(extractErrorMessage(err))
        }
      },
    })
  }

  async function handleChangeRole(user: AdminUserInfo): Promise<void> {
    setActionError(null)
    setActionSuccess(null)
    const newRoleValue: UserRole = user.role === 'admin' ? 'user' : 'admin'
    try {
      await adminFetch<unknown>('PUT', `/api/v1/admin/users/${user.userId}/role`, {
        role: newRoleValue,
      })
      setActionSuccess(
        `Rolle von „${user.username}" auf „${newRoleValue}" geändert.`,
      )
      void loadUsers(page)
    } catch (err: unknown) {
      setActionError(extractErrorMessage(err))
    }
  }

  async function handleResetPassword(user: AdminUserInfo): Promise<void> {
    setActionError(null)
    setActionSuccess(null)
    setTempPassword(null)
    try {
      const result = await adminFetch<{ userId: string; temporaryPassword: string }>(
        'PUT',
        `/api/v1/admin/users/${user.userId}/password`,
      )
      setTempPassword(result.temporaryPassword)
      setActionSuccess(
        `Passwort von „${user.username}" wurde zurückgesetzt.`,
      )
    } catch (err: unknown) {
      setActionError(extractErrorMessage(err))
    }
  }

  async function handleToggleSuspend(user: AdminUserInfo): Promise<void> {
    setActionError(null)
    setActionSuccess(null)
    const endpoint = user.suspended ? 'unsuspend' : 'suspend'
    try {
      await adminFetch<unknown>(
        'PUT',
        `/api/v1/admin/users/${user.userId}/${endpoint}`,
      )
      const action = user.suspended ? 'entsperrt' : 'gesperrt'
      setActionSuccess(`Benutzer „${user.username}" wurde ${action}.`)
      void loadUsers(page)
    } catch (err: unknown) {
      setActionError(extractErrorMessage(err))
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="admin-users-page">
      <h1 className="admin-users-title">Benutzerverwaltung</h1>

      {/* Action feedback */}
      {actionError && (
        <div className="admin-users-message admin-users-message--error" role="alert">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="admin-users-message admin-users-message--success" role="status">
          {actionSuccess}
        </div>
      )}
      {tempPassword && (
        <div className="admin-users-message admin-users-message--info" role="status">
          Temporäres Passwort: <code>{tempPassword}</code>
        </div>
      )}

      {/* Create user form */}
      <section className="admin-users-create">
        <h2 className="admin-users-section-title">Benutzer erstellen</h2>
        <form className="admin-users-create-form" onSubmit={handleCreateUser} noValidate>
          <div className="admin-users-form-field">
            <label htmlFor="admin-create-username">Benutzername</label>
            <input
              id="admin-create-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="3–64 Zeichen"
              maxLength={64}
              required
            />
          </div>
          <div className="admin-users-form-field">
            <label htmlFor="admin-create-password">Passwort</label>
            <input
              id="admin-create-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mindestens 8 Zeichen"
              maxLength={128}
              required
            />
          </div>
          <div className="admin-users-form-field">
            <label htmlFor="admin-create-role">Rolle</label>
            <select
              id="admin-create-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
            >
              <option value="user">Benutzer</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <button
            type="submit"
            className="admin-users-btn admin-users-btn--primary"
            disabled={createLoading}
          >
            {createLoading ? 'Erstellen…' : 'Erstellen'}
          </button>
        </form>
        {createError && (
          <p className="admin-users-message admin-users-message--error" role="alert">
            {createError}
          </p>
        )}
        {createSuccess && (
          <p className="admin-users-message admin-users-message--success" role="status">
            {createSuccess}
          </p>
        )}
      </section>

      {/* User list */}
      <section className="admin-users-list-section">
        <h2 className="admin-users-section-title">
          Benutzer ({total})
        </h2>

        {listLoading && <p className="admin-users-loading">Laden…</p>}
        {listError && (
          <p className="admin-users-message admin-users-message--error" role="alert">
            {listError}
          </p>
        )}

        {!listLoading && users.length === 0 && !listError && (
          <p>Keine Benutzer vorhanden.</p>
        )}

        {users.length > 0 && (
          <div className="admin-users-table-wrapper">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Benutzername</th>
                  <th>Anzeigename</th>
                  <th>E-Mail</th>
                  <th>Rolle</th>
                  <th>Status</th>
                  <th>Erstellt</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId} className={user.suspended ? 'admin-users-row--suspended' : ''}>
                    <td>{user.username}</td>
                    <td>{user.displayName}</td>
                    <td>{user.email || '—'}</td>
                    <td>{user.role === 'admin' ? 'Administrator' : 'Benutzer'}</td>
                    <td>{user.suspended ? 'Gesperrt' : 'Aktiv'}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td className="admin-users-actions">
                      <button
                        className="admin-users-btn admin-users-btn--small"
                        onClick={() => void handleChangeRole(user)}
                        title={user.role === 'admin' ? 'Zu Benutzer herabstufen' : 'Zum Administrator befördern'}
                      >
                        Rolle ändern
                      </button>
                      <button
                        className="admin-users-btn admin-users-btn--small"
                        onClick={() => void handleResetPassword(user)}
                        title="Passwort zurücksetzen"
                      >
                        Passwort zurücksetzen
                      </button>
                      <button
                        className="admin-users-btn admin-users-btn--small"
                        onClick={() => void handleToggleSuspend(user)}
                        title={user.suspended ? 'Konto entsperren' : 'Konto sperren'}
                      >
                        {user.suspended ? 'Entsperren' : 'Sperren'}
                      </button>
                      <button
                        className="admin-users-btn admin-users-btn--small admin-users-btn--danger"
                        onClick={() => handleDeleteUser(user)}
                        title="Benutzer löschen"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="admin-users-pagination">
            <button
              className="admin-users-btn admin-users-btn--small"
              disabled={page <= 1}
              onClick={() => void loadUsers(page - 1)}
            >
              Vorherige
            </button>
            <span className="admin-users-pagination-info">
              Seite {page} von {totalPages}
            </span>
            <button
              className="admin-users-btn admin-users-btn--small"
              disabled={page >= totalPages}
              onClick={() => void loadUsers(page + 1)}
            >
              Nächste
            </button>
          </div>
        )}
      </section>

      {/* Confirmation dialog */}
      {confirmDialog && (
        <div className="admin-users-dialog-overlay" role="dialog" aria-modal="true">
          <div className="admin-users-dialog">
            <p className="admin-users-dialog-message">{confirmDialog.message}</p>
            <div className="admin-users-dialog-actions">
              <button
                className="admin-users-btn admin-users-btn--danger"
                onClick={confirmDialog.onConfirm}
              >
                Bestätigen
              </button>
              <button
                className="admin-users-btn"
                onClick={() => setConfirmDialog(null)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Utility functions ─────────────────────────────────────────────────────

/**
 * Extracts a user-friendly error message from an unknown error.
 */
function extractErrorMessage(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'message' in err) {
    return (err as { message: string }).message
  }
  return 'Ein unbekannter Fehler ist aufgetreten.'
}

/**
 * Formats an ISO 8601 date string to a localized German date.
 */
function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return isoDate
  }
}
