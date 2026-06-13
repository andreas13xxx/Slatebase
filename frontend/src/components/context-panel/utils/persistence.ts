/**
 * localStorage persistence utilities for the Context Panel layout.
 * Handles serialization, deserialization, and validation of persisted layout data.
 */

/** Identifiers for the context panel views */
export type ContextPanelViewId = 'outline' | 'links' | 'tags' | 'properties' | 'search';

/** Persisted layout structure stored in localStorage */
export interface PersistedContextPanelLayout {
  tabOrder: ContextPanelViewId[];
  sections: Array<{
    viewIds: ContextPanelViewId[];
    activeViewId: ContextPanelViewId;
    heightFraction: number;
  }>;
}

const VALID_VIEW_IDS: ReadonlySet<string> = new Set<ContextPanelViewId>([
  'outline',
  'links',
  'tags',
  'properties',
  'search',
]);

/**
 * Generates the localStorage key for a given user.
 */
function getStorageKey(userId: string): string {
  return `slatebase_context_panel_${userId}`;
}

/**
 * Validates that a value is a valid ContextPanelViewId.
 */
function isValidViewId(value: unknown): value is ContextPanelViewId {
  return typeof value === 'string' && VALID_VIEW_IDS.has(value);
}

/**
 * Validates the structure of a persisted layout object.
 * Returns true only if the entire structure is valid.
 */
function isValidLayout(data: unknown): data is PersistedContextPanelLayout {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Validate tabOrder
  if (!Array.isArray(obj['tabOrder'])) {
    return false;
  }

  const tabOrder = obj['tabOrder'] as unknown[];
  if (tabOrder.length === 0) {
    return false;
  }

  for (const id of tabOrder) {
    if (!isValidViewId(id)) {
      return false;
    }
  }

  // Validate sections
  if (!Array.isArray(obj['sections'])) {
    return false;
  }

  const sections = obj['sections'] as unknown[];
  if (sections.length === 0) {
    return false;
  }

  for (const section of sections) {
    if (section === null || typeof section !== 'object') {
      return false;
    }

    const sec = section as Record<string, unknown>;

    // Validate viewIds
    if (!Array.isArray(sec['viewIds'])) {
      return false;
    }

    const viewIds = sec['viewIds'] as unknown[];
    if (viewIds.length === 0) {
      return false;
    }

    for (const viewId of viewIds) {
      if (!isValidViewId(viewId)) {
        return false;
      }
    }

    // Validate activeViewId
    if (!isValidViewId(sec['activeViewId'])) {
      return false;
    }

    // Validate heightFraction
    if (typeof sec['heightFraction'] !== 'number') {
      return false;
    }

    if (sec['heightFraction'] <= 0 || sec['heightFraction'] > 1) {
      return false;
    }
  }

  return true;
}

/**
 * Saves the context panel layout to localStorage.
 * Silently fails if localStorage is unavailable.
 *
 * @param userId - The current user's ID
 * @param layout - The layout to persist
 */
export function saveContextPanelLayout(
  userId: string,
  layout: PersistedContextPanelLayout
): void {
  try {
    const key = getStorageKey(userId);
    const serialized = JSON.stringify(layout);
    localStorage.setItem(key, serialized);
  } catch {
    // localStorage unavailable or quota exceeded — silently ignore
  }
}

/**
 * Loads the context panel layout from localStorage.
 * Returns null if localStorage is unavailable, data is missing, or data is corrupted/invalid.
 *
 * @param userId - The current user's ID
 * @returns The persisted layout or null
 */
export function loadContextPanelLayout(
  userId: string
): PersistedContextPanelLayout | null {
  try {
    const key = getStorageKey(userId);
    const raw = localStorage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isValidLayout(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    // localStorage unavailable, JSON parse error, or any other error — return null
    return null;
  }
}
