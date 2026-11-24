import { warnOnce } from '../plugins/compat/log'

const INSTALLED = Symbol.for('slatebase.domMutationGuard')

/** Short, log-friendly description of a DOM node (tag, id, classes, text start). */
function describeNode(node: Node | null | undefined): string {
  if (!node) return String(node)
  if (node instanceof Element) {
    const id = node.id ? `#${node.id}` : ''
    const cls = typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : ''
    return `<${node.tagName.toLowerCase()}${id}${cls}>`
  }
  return `${node.nodeName} "${(node.textContent ?? '').slice(0, 40)}"`
}

/**
 * Makes `removeChild`/`insertBefore` tolerant of a node that foreign code (a plugin, a CM6
 * widget) already moved or removed behind React's back. Without it, React's commit throws
 * "The node to be removed is not a child of this node" and unmounts the whole tree.
 *
 * The no-op is correct for `removeChild` (the node is already out of that parent) and for
 * `insertBefore` with a stale reference node (appended instead). Every hit is logged once
 * per parent/child description so the offending node can be found.
 */
export function installDomMutationGuard(): void {
  const proto = Node.prototype as Node & { [INSTALLED]?: boolean }
  if (proto[INSTALLED]) return
  proto[INSTALLED] = true

  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      warnOnce(
        `dom-remove-child:${describeNode(this)}:${describeNode(child)}`,
        `removeChild skipped, node is not a child of its expected parent. parent=${describeNode(this)} child=${describeNode(child)} actualParent=${describeNode(child.parentNode)}`,
        { parent: this, child },
      )
      return child
    }
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function insertBefore<T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      warnOnce(
        `dom-insert-before:${describeNode(this)}:${describeNode(ref)}`,
        `insertBefore reference node is not a child, appended instead. parent=${describeNode(this)} ref=${describeNode(ref)}`,
        { parent: this, ref },
      )
      return originalInsertBefore.call(this, node, null) as T
    }
    return originalInsertBefore.call(this, node, ref) as T
  }
}
