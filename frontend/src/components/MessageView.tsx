import { useEffect, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useChatContext } from '../state/chatContext'
import { useAppContext } from '../state/index'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import { loadMessages } from '../state/chatActions'

/**
 * Formats an ISO 8601 timestamp to HH:MM format.
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * MessageView displays messages for the current conversation.
 * Messages are sorted ascending by timestamp.
 * Supports auto-scroll to bottom on new messages and
 * pagination (load older messages on scroll to top).
 */
export function MessageView() {
  const { state, dispatch } = useChatContext()
  const { apiClient } = useAppContext()
  const { authState } = useAuthContext()
  const { t } = useTranslation()

  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef<number>(0)

  const currentUserId = authState.user?.userId ?? ''
  const conversationId = state.currentConversation

  // Resolve sender name from conversation's participantNames
  const currentConversation = state.conversations.find(c => c.id === conversationId)

  const getSenderName = useCallback((senderId: string): string => {
    if (senderId === currentUserId) {
      return t('chat.participants') === 'Teilnehmer' ? 'Du' : 'You'
    }
    if (currentConversation) {
      const idx = currentConversation.participants.indexOf(senderId)
      if (idx !== -1) {
        const name = currentConversation.participantNames[idx]
        if (name) return name
      }
    }
    return senderId
  }, [currentUserId, currentConversation, t])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (state.messages.length > prevMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = state.messages.length
  }, [state.messages.length])

  // Handle scroll to top for pagination
  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (container.scrollTop === 0 && state.hasMoreMessages && !state.isLoading && apiClient && conversationId) {
      loadMessages(dispatch, apiClient, conversationId, state.currentPage + 1)
    }
  }, [state.hasMoreMessages, state.isLoading, state.currentPage, apiClient, conversationId, dispatch])

  // Empty state
  if (!conversationId) {
    return (
      <div className="message-view message-view--empty">
        <p className="message-view-empty-text">{t('chat.noMessages')}</p>
      </div>
    )
  }

  // Messages sorted ascending by timestamp (should already be sorted from backend)
  const sortedMessages = [...state.messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return (
    <div className="message-view" ref={containerRef} onScroll={handleScroll}>
      {state.isLoading && (
        <div className="message-view-loading">
          <Loader2 size={16} className="message-view-spinner" />
        </div>
      )}
      {sortedMessages.length === 0 && !state.isLoading && (
        <p className="message-view-empty-text">{t('chat.noMessages')}</p>
      )}
      {sortedMessages.map(message => {
        const isOwn = message.senderId === currentUserId
        return (
          <div
            key={message.id}
            className={`message-bubble ${isOwn ? 'message-bubble--own' : 'message-bubble--other'}`}
          >
            <span className="message-sender">{getSenderName(message.senderId)}</span>
            <div className="message-content">{message.content}</div>
            <span className="message-time">{formatTime(message.timestamp)}</span>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
