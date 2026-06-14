import { useState } from 'react'
import { Plus, Loader, LogOut } from 'lucide-react'
import { useChatContext } from '../state/chatContext'
import { useAppContext } from '../state/index'
import { useTranslation } from '../i18n'
import { loadMessages, leaveConversation } from '../state/chatActions'
import { dispatchRealtimeUnreadUpdate } from '../state/realtimeChatBridge'
import { NewConversation } from './NewConversation'
import { ConfirmModal } from './ConfirmModal'

/** Props for the ConversationList component. */
export interface ConversationListProps {
  /** Set of user IDs that are currently online. Used to display presence indicators. */
  onlineUserIds?: Set<string>
}

/**
 * Formats a timestamp for display in the conversation list.
 * - Today: "HH:MM"
 * - Yesterday: "Gestern" / "Yesterday"
 * - Older: "DD.MM.YYYY"
 */
function formatTimestamp(isoString: string, locale: string): string {
  const date = new Date(isoString)
  const now = new Date()

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86_400_000)
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (messageDay.getTime() === today.getTime()) {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  if (messageDay.getTime() === yesterday.getTime()) {
    return locale === 'de' ? 'Gestern' : 'Yesterday'
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

/**
 * Displays the list of conversations sorted by last message timestamp.
 * Shows participant names, last message preview, and timestamp.
 * Includes a button to open the NewConversation dialog.
 * Shows leave button per conversation and archived label for archived conversations.
 * Optionally shows green presence dots next to online participants.
 */
export function ConversationList({ onlineUserIds }: ConversationListProps) {
  const { state, dispatch } = useChatContext()
  const { apiClient } = useAppContext()
  const { t, locale } = useTranslation()
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState<{ open: boolean; conversationId: string; unreadCount: number }>({
    open: false,
    conversationId: '',
    unreadCount: 0,
  })

  const handleSelectConversation = (conversationId: string) => {
    if (!apiClient) return
    loadMessages(dispatch, apiClient, conversationId)
    // Calculate new global unread count before dispatch (reducer hasn't run yet)
    const conversation = state.conversations.find(c => c.id === conversationId)
    const unreadToSubtract = conversation?.unreadCount ?? 0
    dispatch({ type: 'CONVERSATION_UNREAD_RESET', payload: conversationId })
    // Push updated global unread count to App.tsx via bridge
    if (unreadToSubtract > 0) {
      const newTotal = Math.max(0, state.globalUnreadCount - unreadToSubtract)
      dispatchRealtimeUnreadUpdate(newTotal)
    }
  }

  const handleLeaveClick = (e: React.MouseEvent, conversationId: string, unreadCount: number) => {
    e.stopPropagation()
    setLeaveConfirm({ open: true, conversationId, unreadCount })
  }

  const handleLeaveConfirm = () => {
    if (!apiClient) return
    void leaveConversation(dispatch, apiClient, leaveConfirm.conversationId, leaveConfirm.unreadCount)
    setLeaveConfirm({ open: false, conversationId: '', unreadCount: 0 })
  }

  const handleLeaveCancel = () => {
    setLeaveConfirm({ open: false, conversationId: '', unreadCount: 0 })
  }

  // Loading state with no conversations
  if (state.isLoading && state.conversations.length === 0) {
    return (
      <div className="conversation-list">
        <div className="conversation-list-header">
          <button
            className="conversation-list-new-btn"
            onClick={() => setShowNewConversation(true)}
            title={t('chat.newConversation')}
            aria-label={t('chat.newConversation')}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="conversation-list-loading">
          <Loader size={16} className="conversation-list-spinner" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  // Empty state
  if (state.conversations.length === 0 && !state.isLoading) {
    return (
      <div className="conversation-list">
        <div className="conversation-list-header">
          <button
            className="conversation-list-new-btn"
            onClick={() => setShowNewConversation(true)}
            title={t('chat.newConversation')}
            aria-label={t('chat.newConversation')}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="conversation-list-empty">
          <p>{t('chat.noConversations')}</p>
        </div>
        {showNewConversation && (
          <NewConversation onClose={() => setShowNewConversation(false)} />
        )}
      </div>
    )
  }

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <button
          className="conversation-list-new-btn"
          onClick={() => setShowNewConversation(true)}
          title={t('chat.newConversation')}
          aria-label={t('chat.newConversation')}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="conversation-list-items">
        {state.conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={`conversation-item${state.currentConversation === conversation.id ? ' active' : ''}`}
            onClick={() => handleSelectConversation(conversation.id)}
            type="button"
          >
            <div className="conversation-item-header">
              <span className="conversation-item-names">
                {conversation.participantNames.map((name, index) => {
                  const participantId = conversation.participants[index]
                  const isOnline = participantId != null && onlineUserIds?.has(participantId)
                  return (
                    <span key={participantId ?? index} className="conversation-item-participant">
                      {index > 0 && ', '}
                      {name}
                      {isOnline && (
                        <span
                          className="presence-dot"
                          aria-label="Online"
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--presence-online)',
                            display: 'inline-block',
                            marginLeft: '4px',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </span>
                  )
                })}
              </span>
              {conversation.archived && (
                <span className="conversation-item-archived">{t('chat.archived')}</span>
              )}
              {conversation.lastMessageTimestamp && (
                <span className="conversation-item-time">
                  {formatTimestamp(conversation.lastMessageTimestamp, locale)}
                </span>
              )}
              <span
                className="conversation-item-leave"
                role="button"
                tabIndex={0}
                onClick={(e) => handleLeaveClick(e, conversation.id, conversation.unreadCount)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setLeaveConfirm({ open: true, conversationId: conversation.id, unreadCount: conversation.unreadCount })
                  }
                }}
                title={t('chat.leaveConversation')}
                aria-label={t('chat.leaveConversation')}
              >
                <LogOut size={14} />
              </span>
            </div>
            <div className="conversation-item-body">
              {conversation.lastMessagePreview && (
                <span className="conversation-item-preview">
                  {conversation.lastMessagePreview}
                </span>
              )}
              {conversation.unreadCount > 0 && (
                <span className="conversation-item-unread">{conversation.unreadCount}</span>
              )}
            </div>
          </button>
        ))}
      </div>
      {showNewConversation && (
        <NewConversation onClose={() => setShowNewConversation(false)} />
      )}
      <ConfirmModal
        open={leaveConfirm.open}
        title={t('chat.leaveConfirmTitle')}
        message={t('chat.leaveConfirmMessage')}
        confirmLabel={t('chat.leaveConfirmButton')}
        variant="danger"
        onConfirm={handleLeaveConfirm}
        onCancel={handleLeaveCancel}
      />
    </div>
  )
}
