/**
 * Canvas parser — validates and parses .canvas JSON files.
 * Uses manual validation for schema checking with passthrough for forward compatibility.
 * Validates node ID uniqueness and edge reference integrity.
 */

import type { CanvasDocument, CanvasNode, CanvasEdge, CanvasParseResult, CanvasValidationError, EdgeSide, EdgeEnd } from './types'

// ─── Validation Helpers ───────────────────────────────────────────────────────

const VALID_SIDES: EdgeSide[] = ['top', 'right', 'bottom', 'left']
const VALID_ENDS: EdgeEnd[] = ['none', 'arrow']
const VALID_BG_STYLES = ['cover', 'ratio', 'exact']

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

// ─── Unknown Property Extraction ──────────────────────────────────────────────

/**
 * Extracts unknown properties from a parsed object.
 * Known keys are removed, remaining keys go into _unknown.
 */
function extractUnknown(raw: Record<string, unknown>, knownKeys: string[]): Record<string, unknown> | undefined {
  const unknown: Record<string, unknown> = {}
  let hasUnknown = false
  for (const key of Object.keys(raw)) {
    if (!knownKeys.includes(key)) {
      unknown[key] = raw[key]
      hasUnknown = true
    }
  }
  return hasUnknown ? unknown : undefined
}

/** Known keys for each node type (base + type-specific). */
const BASE_NODE_KEYS = ['id', 'type', 'x', 'y', 'width', 'height', 'color']
const TEXT_NODE_KEYS = [...BASE_NODE_KEYS, 'text']
const FILE_NODE_KEYS = [...BASE_NODE_KEYS, 'file', 'subpath']
const LINK_NODE_KEYS = [...BASE_NODE_KEYS, 'url']
const GROUP_NODE_KEYS = [...BASE_NODE_KEYS, 'label', 'background', 'backgroundStyle']
const EDGE_KEYS = ['id', 'fromNode', 'fromSide', 'fromEnd', 'toNode', 'toSide', 'toEnd', 'color', 'label']

// ─── Node Parsing ─────────────────────────────────────────────────────────────

/**
 * Validates base node fields (id, x, y, width, height).
 * Returns error messages or empty array on success.
 */
function validateBaseNode(obj: Record<string, unknown>, index: number): string[] {
  const errors: string[] = []
  if (!isNonEmptyString(obj['id'])) errors.push(`nodes[${index}].id: must be a non-empty string`)
  if (!isNumber(obj['x'])) errors.push(`nodes[${index}].x: must be a number`)
  if (!isNumber(obj['y'])) errors.push(`nodes[${index}].y: must be a number`)
  if (!isNumber(obj['width'])) errors.push(`nodes[${index}].width: must be a number`)
  if (!isNumber(obj['height'])) errors.push(`nodes[${index}].height: must be a number`)
  if (obj['color'] !== undefined && !isString(obj['color'])) errors.push(`nodes[${index}].color: must be a string`)
  return errors
}

/**
 * Parses a single node, returning typed CanvasNode or null if invalid/unknown type.
 */
function parseNode(raw: unknown, index: number, errors: CanvasValidationError[]): CanvasNode | null {
  if (!isObject(raw)) {
    errors.push({ message: 'Node must be an object', path: `nodes[${index}]` })
    return null
  }

  const obj = raw

  if (!isString(obj['type'])) {
    errors.push({ message: 'Node missing required field: type', path: `nodes[${index}].type` })
    return null
  }

  // Validate base fields
  const baseErrors = validateBaseNode(obj, index)
  if (baseErrors.length > 0) {
    for (const msg of baseErrors) {
      errors.push({ message: msg, path: msg.split(':')[0] })
    }
    return null
  }

  const id = obj['id'] as string
  const x = obj['x'] as number
  const y = obj['y'] as number
  const width = obj['width'] as number
  const height = obj['height'] as number
  const color = obj['color'] as string | undefined
  const nodeType = obj['type'] as string

  switch (nodeType) {
    case 'text': {
      if (!isString(obj['text'])) {
        errors.push({ message: 'Text node missing required field: text', path: `nodes[${index}].text` })
        return null
      }
      const _unknown = extractUnknown(obj, TEXT_NODE_KEYS)
      return { id, type: 'text', x, y, width, height, color, text: obj['text'] as string, _unknown }
    }
    case 'file': {
      if (!isNonEmptyString(obj['file'])) {
        errors.push({ message: 'File node missing required field: file', path: `nodes[${index}].file` })
        return null
      }
      const subpath = isString(obj['subpath']) ? obj['subpath'] : undefined
      const _unknown = extractUnknown(obj, FILE_NODE_KEYS)
      return { id, type: 'file', x, y, width, height, color, file: obj['file'] as string, subpath, _unknown }
    }
    case 'link': {
      if (!isNonEmptyString(obj['url'])) {
        errors.push({ message: 'Link node missing required field: url', path: `nodes[${index}].url` })
        return null
      }
      const _unknown = extractUnknown(obj, LINK_NODE_KEYS)
      return { id, type: 'link', x, y, width, height, color, url: obj['url'] as string, _unknown }
    }
    case 'group': {
      const label = isString(obj['label']) ? obj['label'] : undefined
      const background = isString(obj['background']) ? obj['background'] : undefined
      const backgroundStyle = isString(obj['backgroundStyle']) && VALID_BG_STYLES.includes(obj['backgroundStyle'])
        ? obj['backgroundStyle'] as 'cover' | 'ratio' | 'exact'
        : undefined
      const _unknown = extractUnknown(obj, GROUP_NODE_KEYS)
      return { id, type: 'group', x, y, width, height, color, label, background, backgroundStyle, _unknown }
    }
    default:
      // Unknown node type — silently skip (forward-compatible)
      return null
  }
}

// ─── Edge Parsing ─────────────────────────────────────────────────────────────

/**
 * Parses a single edge.
 */
function parseEdge(raw: unknown, index: number, errors: CanvasValidationError[]): CanvasEdge | null {
  if (!isObject(raw)) {
    errors.push({ message: 'Edge must be an object', path: `edges[${index}]` })
    return null
  }

  const obj = raw
  const edgeErrors: string[] = []

  if (!isNonEmptyString(obj['id'])) edgeErrors.push('id: must be a non-empty string')
  if (!isNonEmptyString(obj['fromNode'])) edgeErrors.push('fromNode: must be a non-empty string')
  if (!isString(obj['fromSide']) || !VALID_SIDES.includes(obj['fromSide'] as EdgeSide)) edgeErrors.push('fromSide: must be top|right|bottom|left')
  if (!isNonEmptyString(obj['toNode'])) edgeErrors.push('toNode: must be a non-empty string')
  if (!isString(obj['toSide']) || !VALID_SIDES.includes(obj['toSide'] as EdgeSide)) edgeErrors.push('toSide: must be top|right|bottom|left')

  if (obj['fromEnd'] !== undefined && (!isString(obj['fromEnd']) || !VALID_ENDS.includes(obj['fromEnd'] as EdgeEnd))) {
    edgeErrors.push('fromEnd: must be none|arrow')
  }
  if (obj['toEnd'] !== undefined && (!isString(obj['toEnd']) || !VALID_ENDS.includes(obj['toEnd'] as EdgeEnd))) {
    edgeErrors.push('toEnd: must be none|arrow')
  }

  if (edgeErrors.length > 0) {
    for (const msg of edgeErrors) {
      errors.push({ message: `Invalid field: ${msg}`, path: `edges[${index}].${msg.split(':')[0]}` })
    }
    return null
  }

  const _unknown = extractUnknown(obj, EDGE_KEYS)

  return {
    id: obj['id'] as string,
    fromNode: obj['fromNode'] as string,
    fromSide: obj['fromSide'] as EdgeSide,
    fromEnd: obj['fromEnd'] as EdgeEnd | undefined,
    toNode: obj['toNode'] as string,
    toSide: obj['toSide'] as EdgeSide,
    toEnd: obj['toEnd'] as EdgeEnd | undefined,
    color: isString(obj['color']) ? obj['color'] : undefined,
    label: isString(obj['label']) ? obj['label'] : undefined,
    _unknown,
  }
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parses a canvas JSON string into a typed CanvasDocument.
 *
 * - Validates JSON syntax
 * - Validates all nodes and edges
 * - Checks node ID uniqueness
 * - Validates edge references (fromNode/toNode must exist)
 * - Preserves unknown fields for round-trip compatibility
 */
export function parseCanvas(json: string): CanvasParseResult {
  // Step 1: Parse JSON
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON'
    return { success: false, errors: [{ message: `JSON parse error: ${message}` }] }
  }

  // Step 2: Validate top-level structure
  if (!isObject(raw)) {
    return { success: false, errors: [{ message: 'Canvas must be a JSON object' }] }
  }

  if (!Array.isArray(raw['nodes'])) {
    return { success: false, errors: [{ message: 'Missing required field: nodes (must be an array)' }] }
  }
  if (!Array.isArray(raw['edges'])) {
    return { success: false, errors: [{ message: 'Missing required field: edges (must be an array)' }] }
  }

  const rawNodes = raw['nodes'] as unknown[]
  const rawEdges = raw['edges'] as unknown[]

  const errors: CanvasValidationError[] = []
  const nodes: CanvasNode[] = []
  const nodeIds = new Set<string>()

  // Step 3: Parse nodes
  for (let i = 0; i < rawNodes.length; i++) {
    const node = parseNode(rawNodes[i], i, errors)
    if (node) {
      if (nodeIds.has(node.id)) {
        errors.push({ message: `Duplicate node ID: "${node.id}"`, path: `nodes[${i}].id` })
      } else {
        nodeIds.add(node.id)
        nodes.push(node)
      }
    }
  }

  // Step 4: Parse edges
  const edges: CanvasEdge[] = []
  for (let i = 0; i < rawEdges.length; i++) {
    const edge = parseEdge(rawEdges[i], i, errors)
    if (edge) {
      if (!nodeIds.has(edge.fromNode)) {
        errors.push({ message: `Edge references non-existent fromNode: "${edge.fromNode}"`, path: `edges[${i}].fromNode` })
      }
      if (!nodeIds.has(edge.toNode)) {
        errors.push({ message: `Edge references non-existent toNode: "${edge.toNode}"`, path: `edges[${i}].toNode` })
      }
      edges.push(edge)
    }
  }

  // If no nodes could be parsed and there are errors, fail
  if (errors.length > 0 && nodes.length === 0 && rawNodes.length > 0) {
    return { success: false, errors }
  }

  // Extract unknown top-level properties
  const knownTopKeys = ['nodes', 'edges']
  const _unknown = extractUnknown(raw, knownTopKeys)

  const document: CanvasDocument = { nodes, edges, _unknown }

  return { success: true, document, errors: errors.length > 0 ? errors : undefined }
}
