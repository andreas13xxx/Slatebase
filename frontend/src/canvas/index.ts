/**
 * Canvas module barrel export.
 * Provides types, parser, and serializer for Obsidian .canvas files.
 */

export type {
  BaseNode,
  TextNode,
  FileNode,
  LinkNode,
  GroupNode,
  CanvasNode,
  EdgeSide,
  EdgeEnd,
  CanvasEdge,
  CanvasDocument,
  CanvasValidationError,
  CanvasParseResult,
} from './types'

export { parseCanvas } from './parser'
export { serializeCanvas } from './serializer'
