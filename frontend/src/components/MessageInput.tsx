import { useState, useCallback, type KeyboardEvent, type ChangeEvent } from 'react'
import { Send } from 'lucide-react'
import { useChatContext } from '../state/chatContext'
import { useAppContext } from '../state/index'
import { useTranslation } from '../i18n/index'
import { useToast } from './Toast'
import { sendMessage } from '../state/chatActions'

/** Maximum allowed message content length. */
const MAX_LENGTH = 4000

/** Character count is shown when content exceeds this threshold. */
const COUNTER_THRESHOLD = 3800

/** Props for the MessageInput component. */
interface MessageInputProps {
  /** The conversation ID to send messages to. */
  conversationId: string
}

/**
 * Chat message input with textarea, send button, character counter,
 * and rate-limit error handling.
 */
export function MessageInput({ conversationId }: MessageInputProps) {
  const { state, dispatch } = useChatContext()
  const { apiClient } = useAppContext()
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [content, setContent] = useState('')

  const trimmed = content.trim()
  const isOverLimit = content.length > MAX_LENGTH
  const isEmpty = trimmed.length === 0
  const isSendDisabled = isEmpty || isOverLimit || state.isSending

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  const handleSend = useCallback(async () => {
    if (isSendDisabled || !apiClient) return

    const result = await sendMessage(dispatch, apiClient, conversationId, trimmed)
    if (result) {
      setContent('')
    } else {
      // Check for rate limit error in state
      const errorMessage = state.error ?? ''
      const rateLimitMatch = errorMessage.match(/(\d+)\s*(seconds?|Sekunden?)/)
      if (rateLimitMatch?.[1]) {
        showToast(t('chat.rateLimited', { seconds: rateLimitMatch[1] }), 'error')
      } else if (errorMessage.toLowerCase().includes('rate') || errorMessage.includes('429')) {
        showToast(t('chat.rateLimited', { seconds: '60' }), 'error')
      }
    }
  }, [isSendDisabled, apiClient, dispatch, conversationId, trimmed, state.error, showToast, t])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  return (
    <div className="message-input">
      <div className="message-input-body">
        <textarea
          className="message-input-textarea"
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.sendPlaceholder')}
          disabled={state.isSending}
          rows={1}
          aria-label={t('chat.sendPlaceholder')}
        />
        {content.length > COUNTER_THRESHOLD && (
          <span className={`message-input-counter${isOverLimit ? ' message-input-counter--over' : ''}`}>
            {content.length}/{MAX_LENGTH}
          </span>
        )}
      </div>
      <button
        type="button"
        className="message-input-send"
        onClick={handleSend}
        disabled={isSendDisabled}
        title={t('chat.send')}
        aria-label={t('chat.send')}
      >
        <Send size={18} />
      </button>
    </div>
  )
}
