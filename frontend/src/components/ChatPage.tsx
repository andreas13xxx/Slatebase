import { useEffect, useState } from 'react'
import { ChatProvider, useChatContext } from '../state/chatContext'
import { useAppContext } from '../state'
import { useRealtimeContext } from '../state/realtimeContext'
import { useTranslation } from '../i18n'
import { loadConversations } from '../state/chatActions'
import {
  onRealtimeChatMessage,
  onRealtimeConversationPreview,
} from '../state/realtimeChatBridge'
import { onPresenceChange, getOnlineUserIds } from '../state/realtimePresenceBridge'
import { ConversationList } from './ConversationList'
import { MessageView } from './MessageView'
import { MessageInput } from './MessageInput'

/**
 * Main chat page component. Wraps content in ChatProvider for lazy loading pattern.
 * Renders as a settings tab (like Profile, Sessions).
 */
export function ChatPage() {
  return (
    <ChatProvider>
      <ChatPageContent />
    </ChatProvider>
  )
}

/**
 * Inner chat page content that consumes the ChatContext.
 * Two-panel layout: ConversationList (left) + MessageView/MessageInput (right).
 */
function ChatPageContent() {
  const { state, dispatch } = useChatContext()
  const { apiClient } = useAppContext()
  const { state: realtimeState } = useRealtimeContext()
  const { t } = useTranslation()
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => getOnlineUserIds())

  useEffect(() => {
    return onPresenceChange(setOnlineUserIds)
  }, [])

  useEffect(() => {
    if (apiClient) {
      loadConversations(dispatch, apiClient)
    }
  }, [dispatch, apiClient])

  // Register realtime chat message callback — dispatches incoming messages to chat state
  useEffect(() => {
    return onRealtimeChatMessage((message) => {
      dispatch({ type: 'REALTIME_MESSAGE_RECEIVED', payload: message })
    })
  }, [dispatch])

  // Redundant listener via CustomEvent — guarantees delivery regardless of callback registration timing
  useEffect(() => {
    const handler = (e: Event) => {
      const message = (e as CustomEvent).detail
      dispatch({ type: 'REALTIME_MESSAGE_RECEIVED', payload: message })
    }
    window.addEventListener('slatebase:chat-message', handler)
    return () => { window.removeEventListener('slatebase:chat-message', handler) }
  }, [dispatch])

  // Register realtime conversation preview callback — updates conversation list ordering
  useEffect(() => {
    return onRealtimeConversationPreview((conversationId, preview, timestamp) => {
      dispatch({
        type: 'REALTIME_CONVERSATION_PREVIEW_UPDATED',
        payload: { conversationId, preview, timestamp },
      })
    })
  }, [dispatch])

  // Redundant listener for conversation preview updates
  useEffect(() => {
    const handler = (e: Event) => {
      const { conversationId, preview, timestamp } = (e as CustomEvent).detail
      dispatch({
        type: 'REALTIME_CONVERSATION_PREVIEW_UPDATED',
        payload: { conversationId, preview, timestamp },
      })
    }
    window.addEventListener('slatebase:chat-preview', handler)
    return () => { window.removeEventListener('slatebase:chat-preview', handler) }
  }, [dispatch])

  // Periodic refresh of conversation list every 30 seconds
  // Disabled when SSE is connected (realtime pushes conversation updates)
  useEffect(() => {
    if (!apiClient) return
    if (realtimeState.connectionStatus === 'connected') return

    const intervalId = setInterval(() => {
      loadConversations(dispatch, apiClient)
    }, 30_000)

    return () => {
      clearInterval(intervalId)
    }
  }, [dispatch, apiClient, realtimeState.connectionStatus])

  // Refresh conversation list immediately when tab becomes visible again
  // Disabled when SSE is connected (realtime handles updates in real-time)
  useEffect(() => {
    if (realtimeState.connectionStatus === 'connected') return

    const handler = () => {
      if (document.visibilityState === 'visible' && apiClient) {
        loadConversations(dispatch, apiClient)
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
    }
  }, [dispatch, apiClient, realtimeState.connectionStatus])

  const currentConv = state.conversations.find(c => c.id === state.currentConversation)
  const isArchived = currentConv?.archived === true

  return (
    <div className="chat-page">
      <div className="chat-sidebar">
        <ConversationList onlineUserIds={onlineUserIds} />
      </div>
      <div className="chat-main">
        {state.currentConversation ? (
          <>
            <MessageView />
            {isArchived ? (
              <div className="chat-archived-notice">
                <p>{t('chat.archivedMessage')}</p>
              </div>
            ) : (
              <MessageInput conversationId={state.currentConversation} />
            )}
          </>
        ) : (
          <div className="chat-empty-state">
            <p>{t('chat.noConversations')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
