/** True for tabs that stand for a real vault file (not the graph or a plugin view). */
export function isBreadcrumbPath(filePath: string): boolean {
  return filePath !== '__graph__' && !filePath.startsWith('__view::')
}
