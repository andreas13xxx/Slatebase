import type { DirectoryTree } from '../types'
import type { GraphData } from '../types'

/** Number of steps one full time-lapse run is divided into. */
export const TIMELAPSE_STEPS = 100

/** Collects the creation time (unix ms) of every file in a directory tree, keyed by path. */
export function collectCreationTimes(tree: DirectoryTree): Map<string, number> {
  const result = new Map<string, number>()
  const walk = (node: DirectoryTree): void => {
    if (node.type === 'file') {
      const time = node.ctime ?? node.mtime
      if (typeof time === 'number' && time > 0) result.set(node.path, time)
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return result
}

/** Earliest and latest creation time among `times`, or null when there are none. */
export function getTimelapseRange(times: Map<string, number>): { start: number; end: number } | null {
  let start = Infinity
  let end = -Infinity
  for (const time of times.values()) {
    if (time < start) start = time
    if (time > end) end = time
  }
  return start === Infinity ? null : { start, end }
}

/**
 * IDs of the graph nodes visible at `cutoff`. A file node shows once it exists;
 * a file without a known creation time (e.g. an unresolved link target) and
 * tag/property nodes show as soon as one node linked to them is visible.
 */
export function computeVisibleNodeIds(
  data: GraphData,
  creationTimes: Map<string, number>,
  cutoff: number,
): Set<string> {
  const visible = new Set<string>()
  const dated = new Set<string>()
  for (const node of data.nodes) {
    if (node.type !== 'file') continue
    const time = creationTimes.get(node.path ?? node.id)
    if (time === undefined) continue
    dated.add(node.id)
    if (time <= cutoff) visible.add(node.id)
  }
  const neighbours = new Map<string, string[]>()
  for (const edge of data.edges) {
    neighbours.set(edge.source, [...(neighbours.get(edge.source) ?? []), edge.target])
    neighbours.set(edge.target, [...(neighbours.get(edge.target) ?? []), edge.source])
  }
  for (const node of data.nodes) {
    if (node.type === 'file' && dated.has(node.id)) continue
    if ((neighbours.get(node.id) ?? []).some((id) => dated.has(id) && visible.has(id))) visible.add(node.id)
  }
  return visible
}

const TIMELAPSE_REQUEST_EVENT = 'slatebase:graph-timelapse'
let timelapseRequested = false

/**
 * Asks the vault-wide graph to start its time-lapse. The request is also parked,
 * because the command opens the graph tab first and its listener is not mounted yet.
 */
export function requestGraphTimelapse(): void {
  timelapseRequested = true
  window.dispatchEvent(new CustomEvent(TIMELAPSE_REQUEST_EVENT))
}

/** Returns true once if a time-lapse was requested and not yet picked up. */
export function consumeGraphTimelapseRequest(): boolean {
  const pending = timelapseRequested
  timelapseRequested = false
  return pending
}

/** Subscribes to time-lapse requests; returns the unsubscribe function. */
export function onGraphTimelapseRequest(listener: () => void): () => void {
  window.addEventListener(TIMELAPSE_REQUEST_EVENT, listener)
  return () => window.removeEventListener(TIMELAPSE_REQUEST_EVENT, listener)
}
