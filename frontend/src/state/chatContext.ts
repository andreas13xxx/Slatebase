import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { chatReducer, initialChatState, type ChatState, type ChatAction } from './chatState'

/** Context value shape exposing chat state and dispatch. */
export interface ChatContextValue {
  state: ChatState
  dispatch: Dispatch<ChatAction>
}

/** React Context for chat state management. */
export const ChatContext = createContext<ChatContextValue | null>(null)

/** Props for the ChatProvider component. */
interface ChatProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the chat area with chat state management.
 * Uses useReducer for predictable chat state transitions.
 */
export function ChatProvider({ children }: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)

  return React.createElement(
    ChatContext.Provider,
    { value: { state, dispatch } },
    children,
  )
}

/**
 * Hook to access the ChatContext. Throws if used outside ChatProvider.
 */
export function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext)
  if (context === null) {
    throw new Error('useChatContext must be used within a ChatProvider')
  }
  return context
}
