import { useEffect } from 'react'
import { ChatProvider, useChatContext } from '../state/chatContext'
import { useAppContext } from '../state'
import { useTranslation } from '../i18n'
import { loadConversations } from '../state/chatActions'
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
  const { t } = useTranslation()

  useEffect(() => {
    if (apiClient) {
      loadConversations(dispatch, apiClient)
    }
  }, [dispatch, apiClient])

  // Periodic refresh of conversation list every 30 seconds
  useEffect(() => {
    if (!apiClient) return

    const intervalId = setInterval(() => {
      loadConversations(dispatch, apiClient)
    }, 30_000)

    return () => {
      clearInterval(intervalId)
    }
  }, [dispatch, apiClient])

  // Refresh conversation list immediately when tab becomes visible again
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && apiClient) {
        loadConversations(dispatch, apiClient)
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
    }
  }, [dispatch, apiClient])

  const currentConv = state.conversations.find(c => c.id === state.currentConversation)
  const isArchived = currentConv?.archived === true

  return (
    <div className="chat-page">
      <div className="chat-sidebar">
        <ConversationList />
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
