/**
 * True for tabs that are not a vault file: graph, local graph, plugin views, web viewer.
 * All of them use a virtual path that starts with `__`.
 */
export function isVirtualTabPath(filePath: string): boolean {
  return filePath.startsWith('__')
}

/** True for tabs that stand for a real vault file (not a graph, plugin view or web page). */
export function isBreadcrumbPath(filePath: string): boolean {
  return !isVirtualTabPath(filePath)
}
