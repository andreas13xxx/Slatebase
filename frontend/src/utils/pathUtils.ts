/**
 * Path utility functions for the FileExplorer and Editor.
 * Handles relative path computation, image detection, drop target
 * calculation, and context menu viewport clamping.
 */
import type { DirectoryTree } from '../types'

/** Set of recognized image file extensions (lowercase, without dot). */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp'])

/** Set of recognized PDF file extensions (lowercase, without dot). */
const PDF_EXTENSIONS = new Set(['pdf'])

/**
 * Computes the POSIX relative path from one file to another.
 * Both paths must be relative vault paths using forward slashes.
 *
 * @param fromFilePath - The source file path (the file linking FROM).
 * @param toFilePath - The target file path (the file linking TO).
 * @returns A relative POSIX path from the source's directory to the target.
 */
export function computeRelativePath(fromFilePath: string, toFilePath: string): string {
  const fromParts = fromFilePath.split('/')
  const toParts = toFilePath.split('/')

  // Get the directory of the source file (remove filename)
  fromParts.pop()

  // Find the common prefix length
  let commonLength = 0
  const maxCommon = Math.min(fromParts.length, toParts.length)
  for (let i = 0; i < maxCommon; i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++
    } else {
      break
    }
  }

  // Build the relative path: go up from source dir, then down to target
  const upCount = fromParts.length - commonLength
  const upSegments = Array.from({ length: upCount }, () => '..')
  const downSegments = toParts.slice(commonLength)

  const relativePath = [...upSegments, ...downSegments].join('/')

  // If the target is in the same directory, prefix with ./
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

/**
 * Determines whether a file is an image based on its extension.
 * Checks against: png, jpg, jpeg, gif, svg, webp, avif.
 *
 * @param fileName - The filename (with extension) to check.
 * @returns True if the file has a recognized image extension.
 */
export function isImageFile(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === fileName.length - 1) {
    return false
  }
  const extension = fileName.slice(dotIndex + 1).toLowerCase()
  return IMAGE_EXTENSIONS.has(extension)
}

/**
 * Determines whether a file is a PDF based on its extension.
 *
 * @param fileName - The filename (with extension) to check.
 * @returns True if the file has a .pdf extension.
 */
export function isPdfFile(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === fileName.length - 1) {
    return false
  }
  const extension = fileName.slice(dotIndex + 1).toLowerCase()
  return PDF_EXTENSIONS.has(extension)
}

/**
 * Determines whether a file should get an embed link (![[...]]) when dropped on the editor.
 * This includes images and PDFs.
 *
 * @param fileName - The filename (with extension) to check.
 * @returns True if the file should be embedded with ![[filename]].
 */
export function isEmbeddableFile(fileName: string): boolean {
  return isImageFile(fileName) || isPdfFile(fileName)
}

/**
 * Computes the set of valid drop targets for a dragged node.
 * Excludes the dragged node itself and all its descendants.
 * Only directories are valid drop targets.
 *
 * @param tree - The root directory tree node.
 * @param draggedPath - The path of the node being dragged.
 * @returns A Set of paths that are valid drop targets.
 */
export function getValidDropTargets(tree: DirectoryTree, draggedPath: string): Set<string> {
  const validTargets = new Set<string>()
  const draggedPrefix = draggedPath + '/'

  function traverse(node: DirectoryTree): void {
    // Skip the dragged node and all its descendants
    if (node.path === draggedPath || node.path.startsWith(draggedPrefix)) {
      return
    }

    // Only directories are valid drop targets
    if (node.type === 'directory') {
      validTargets.add(node.path)
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  traverse(tree)
  return validTargets
}

/**
 * Computes the position of a context menu ensuring it stays within
 * the viewport with at least 8px margin on all sides.
 *
 * @param x - The requested X position (e.g., mouse click X).
 * @param y - The requested Y position (e.g., mouse click Y).
 * @param menuWidth - The width of the context menu.
 * @param menuHeight - The height of the context menu.
 * @param viewportWidth - The viewport width.
 * @param viewportHeight - The viewport height.
 * @returns The clamped { x, y } position for the menu.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const margin = 8

  // Clamp X: ensure menu fits within [margin, viewportWidth - margin - menuWidth]
  const maxX = viewportWidth - margin - menuWidth
  const clampedX = Math.max(margin, Math.min(x, maxX))

  // Clamp Y: ensure menu fits within [margin, viewportHeight - margin - menuHeight]
  const maxY = viewportHeight - margin - menuHeight
  const clampedY = Math.max(margin, Math.min(y, maxY))

  return { x: clampedX, y: clampedY }
}
