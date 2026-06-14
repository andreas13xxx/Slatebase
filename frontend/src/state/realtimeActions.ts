/**
 * Realtime action utilities — helpers for the EventSource client
 * reconnect logic and event handling.
 */

/**
 * Computes the reconnect delay using exponential backoff with jitter.
 *
 * Formula: min(1000 * 2^attempt + jitter, 60000)
 * where jitter is a random value between -500 and +500 ms.
 *
 * The result is clamped to never be negative and never exceed 60000ms.
 *
 * @param attempt - The current reconnect attempt number (0-indexed)
 * @returns Delay in milliseconds before the next reconnect attempt
 */
export function computeReconnectDelay(attempt: number): number {
  const baseDelay = 1000 * Math.pow(2, attempt)
  const jitter = Math.random() * 1000 - 500 // ±500ms
  const delay = baseDelay + jitter
  // Clamp: never negative, never > 60000ms
  return Math.max(0, Math.min(delay, 60000))
}
