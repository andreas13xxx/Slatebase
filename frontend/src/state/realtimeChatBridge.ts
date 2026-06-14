/**
 * Module-level bridge between RealtimeProvider (SSE events) and Chat state.
 *
 * Problem: RealtimeProvider sits above AppProvider/ChatProvider in the component tree,
 * so it cannot directly dispatch chat actions. This module provides a callback registry
 * that child components (AppContent, ChatPage) can subscribe to for receiving
 * realtime chat events.
 *
 * Pattern: Same as apiClient.setOnSessionExpired — module-level mutable callback.
 */

import type { Message } from './chatState'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Callback for incoming chat messages via SSE. */
export type ChatMessageCallback = (message: Message) => void

/** Callback for unread count updates via SSE. */
export type UnreadUpdateCallback = (totalUnread: number) => void

/** Callback for conversation preview updates via SSE. */
export type ConversationPreviewCallback = (conversationId: string, preview: string, timestamp: string) => void

// ─── Module-Level State ──────────────────────────────────────────────────────

const chatMessageCallbacks: Set<ChatMessageCallback> = new Set()
const unreadUpdateCallbacks: Set<UnreadUpdateCallback> = new Set()
const conversationPreviewCallbacks: Set<ConversationPreviewCallback> = new Set()

// ─── Registration Functions ──────────────────────────────────────────────────

/**
 * Subscribe to incoming chat messages.
 * Called by ChatPage when it mounts (has access to chatDispatch).
 * Returns an unsubscribe function.
 */
export function onRealtimeChatMessage(cb: ChatMessageCallback): () => void {
  chatMessageCallbacks.add(cb)
  return () => { chatMessageCallbacks.delete(cb) }
}

/**
 * Subscribe to unread count updates.
 * Called by AppContent when it mounts (has access to setGlobalUnreadCount).
 * Returns an unsubscribe function.
 */
export function onRealtimeUnreadUpdate(cb: UnreadUpdateCallback): () => void {
  unreadUpdateCallbacks.add(cb)
  return () => { unreadUpdateCallbacks.delete(cb) }
}

/**
 * Subscribe to conversation preview updates.
 * Called by ChatPage when it mounts.
 * Returns an unsubscribe function.
 */
export function onRealtimeConversationPreview(cb: ConversationPreviewCallback): () => void {
  conversationPreviewCallbacks.add(cb)
  return () => { conversationPreviewCallbacks.delete(cb) }
}

// ─── Dispatch Functions (called by RealtimeBridge) ───────────────────────────

/**
 * Dispatches an incoming chat message to all registered callbacks
 * AND fires a CustomEvent on window for components that listen directly.
 */
export function dispatchRealtimeChatMessage(message: Message): void {
  for (const cb of chatMessageCallbacks) {
    cb(message)
  }
  // Redundant delivery via CustomEvent — guarantees delivery even if
  // callback registration timing is off (e.g. during ChatPage mount/unmount)
  window.dispatchEvent(new CustomEvent('slatebase:chat-message', { detail: message }))
}

/**
 * Dispatches an unread count update to all registered callbacks.
 */
export function dispatchRealtimeUnreadUpdate(totalUnread: number): void {
  for (const cb of unreadUpdateCallbacks) {
    cb(totalUnread)
  }
}

/**
 * Dispatches a conversation preview update to all registered callbacks
 * AND fires a CustomEvent on window.
 */
export function dispatchRealtimeConversationPreview(conversationId: string, preview: string, timestamp: string): void {
  for (const cb of conversationPreviewCallbacks) {
    cb(conversationId, preview, timestamp)
  }
  window.dispatchEvent(new CustomEvent('slatebase:chat-preview', {
    detail: { conversationId, preview, timestamp },
  }))
}
