import { useState, useEffect, useRef } from 'react'
import { X, UserPlus, Search } from 'lucide-react'
import { useChatContext } from '../state/chatContext'
import { useAppContext } from '../state'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import { createConversation, loadConversations } from '../state/chatActions'
import type { UserSearchResult } from '../api'

/** Props for the NewConversation component. */
export interface NewConversationProps {
  /** Called when the dialog should close. */
  onClose: () => void
}

/** Maximum number of additional participants allowed. */
const MAX_PARTICIPANTS = 49

/** Debounce delay for user search in milliseconds. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Dialog component for creating a new conversation.
 * Provides user search with autocomplete, participant chips, and validation.
 * Reuses the debounced search pattern from VaultSharing.tsx.
 */
export function NewConversation({ onClose }: NewConversationProps) {
  const { dispatch } = useChatContext()
  const { apiClient } = useAppContext()
  const { authState } = useAuthContext()
  const { t } = useTranslation()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [showResults, setShowResults] = useState(false)

  // Selected participants
  const [participants, setParticipants] = useState<UserSearchResult[]>([])

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Refs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLUListElement>(null)

  const currentUserId = authState.user?.userId ?? ''

  /**
   * Performs the user search and filters out already-selected and current user.
   */
  async function performSearch(query: string): Promise<void> {
    if (!apiClient) return

    try {
      const results = await apiClient.searchUsers(query)
      const selectedIds = new Set(participants.map((p) => p.userId))
      const filtered = results.filter(
        (user) => user.userId !== currentUserId && !selectedIds.has(user.userId),
      )
      setSearchResults(filtered)
      setShowResults(filtered.length > 0)
    } catch {
      setSearchResults([])
      setShowResults(false)
    }
  }

  /**
   * Debounced user search via API.
   */
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([])
      setShowResults(false)
      return
    }

    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      void performSearch(searchQuery.trim())
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Adds a user to the selected participants.
   */
  function addParticipant(user: UserSearchResult): void {
    if (participants.length >= MAX_PARTICIPANTS) {
      setError(t('chat.tooManyParticipants'))
      return
    }

    setParticipants((prev) => [...prev, user])
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    setError(null)
    inputRef.current?.focus()
  }

  /**
   * Removes a participant from the selected list.
   */
  function removeParticipant(userId: string): void {
    setParticipants((prev) => prev.filter((p) => p.userId !== userId))
    if (error) setError(null)
  }

  /**
   * Handles the create button click.
   */
  async function handleCreate(): Promise<void> {
    if (participants.length === 0) {
      setError(t('chat.tooFewParticipants'))
      return
    }

    if (participants.length > MAX_PARTICIPANTS) {
      setError(t('chat.tooManyParticipants'))
      return
    }

    if (!apiClient) return

    setCreating(true)
    setError(null)

    const participantIds = participants.map((p) => p.userId)
    const result = await createConversation(dispatch, apiClient, participantIds)

    if (result) {
      await loadConversations(dispatch, apiClient)
      onClose()
    } else {
      setCreating(false)
    }
  }

  /**
   * Closes results dropdown when clicking outside.
   */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /**
   * Closes dialog on Escape key.
   */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="new-conversation-overlay" onClick={onClose}>
      <div
        className="new-conversation-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.newConversation')}
      >
        <div className="new-conversation-header">
          <h3>{t('chat.newConversation')}</h3>
          <button
            className="new-conversation-close"
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search input */}
        <div className="new-conversation-search">
          <Search size={14} className="new-conversation-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowResults(true)
              }
            }}
            placeholder={t('chat.addParticipant')}
            autoComplete="off"
            aria-label={t('chat.addParticipant')}
          />
        </div>

        {/* Search results dropdown */}
        {showResults && searchResults.length > 0 && (
          <ul
            ref={resultsRef}
            className="new-conversation-results"
            role="listbox"
            aria-label={t('chat.participants')}
          >
            {searchResults.map((user) => (
              <li
                key={user.userId}
                className="new-conversation-result-item"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addParticipant(user)
                }}
              >
                <span className="new-conversation-result-username">{user.username}</span>
                {user.displayName && user.displayName !== user.username && (
                  <span className="new-conversation-result-display">{user.displayName}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Selected participants as chips */}
        {participants.length > 0 && (
          <div className="new-conversation-chips">
            {participants.map((p) => (
              <span key={p.userId} className="participant-chip">
                <span className="participant-chip-name">
                  {p.displayName || p.username}
                </span>
                <button
                  type="button"
                  className="participant-chip-remove"
                  onClick={() => removeParticipant(p.userId)}
                  aria-label={`${p.username} ${t('common.delete')}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Error display */}
        {error && (
          <p className="new-conversation-error" role="alert">{error}</p>
        )}

        {/* Create button */}
        <div className="new-conversation-actions">
          <button
            type="button"
            className="new-conversation-create-btn"
            onClick={() => void handleCreate()}
            disabled={creating || participants.length === 0}
          >
            <UserPlus size={14} />
            {creating ? t('common.loading') : t('chat.newConversation')}
          </button>
        </div>
      </div>
    </div>
  )
}
