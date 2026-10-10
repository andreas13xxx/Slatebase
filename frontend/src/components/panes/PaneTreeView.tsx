import { useRef, useState, type ReactNode } from 'react'
import type { Dispatch } from 'react'
import type { PaneTree, PaneTreeNode, PaneNode, SplitNode, PaneTreeAction, SplitDirection } from '../../state/paneTreeState'
import { PaneSplitHandle } from './PaneSplitHandle'
import { TAB_DRAG_MIME } from '../TabBar'
import './panes.css'

interface PaneTreeViewProps {
  tree: PaneTree
  dispatch: Dispatch<PaneTreeAction>
  /**
   * Renders the CONTENT of a single pane (its tab bar + tab content). Injected
   * by the host so this component stays free of the tab/provider wiring and
   * remains testable in isolation. `isActive` lets the host mark the active
   * pane; `onFocus` must be called when the pane gains focus.
   */
  renderPane: (pane: PaneNode, isActive: boolean, onFocus: () => void) => ReactNode
  /** Accessible label template for resize handles (e.g. "Resize pane"). */
  resizeLabel: string
  /**
   * Produces a stable id for a pane created by an edge-drop split. Injected so
   * id generation stays with the host (deterministic in tests). Omit to disable
   * edge-drop splitting (the component then renders no edge zones).
   */
  generatePaneId?: () => string
}

/** Recursively render the pane tree into nested flex containers. */
export function PaneTreeView({ tree, dispatch, renderPane, resizeLabel, generatePaneId }: PaneTreeViewProps) {
  const renderNode = (node: PaneTreeNode): ReactNode => {
    if (node.kind === 'pane') {
      const isActive = node.id === tree.activePaneId
      return (
        <PaneLeaf
          key={node.id}
          pane={node}
          isActive={isActive}
          onFocus={() => dispatch({ type: 'FOCUS_PANE', payload: { paneId: node.id } })}
          renderPane={renderPane}
          dispatch={dispatch}
          generatePaneId={generatePaneId}
        />
      )
    }
    return <SplitContainer key={node.id} split={node} dispatch={dispatch} renderNode={renderNode} resizeLabel={resizeLabel} />
  }

  return <div className="pane-tree-root">{renderNode(tree.root)}</div>
}

interface PaneLeafProps {
  pane: PaneNode
  isActive: boolean
  onFocus: () => void
  renderPane: PaneTreeViewProps['renderPane']
  dispatch: Dispatch<PaneTreeAction>
  generatePaneId?: () => string
}

/** Which edge a tab-drag is hovering, for the split-on-drop preview. */
type DropEdge = 'left' | 'right' | 'top' | 'bottom'

const EDGE_SPLIT: Record<DropEdge, { direction: SplitDirection; before: boolean }> = {
  left: { direction: 'horizontal', before: true },
  right: { direction: 'horizontal', before: false },
  top: { direction: 'vertical', before: true },
  bottom: { direction: 'vertical', before: false },
}

function PaneLeaf({ pane, isActive, onFocus, renderPane, dispatch, generatePaneId }: PaneLeafProps) {
  const [hoverEdge, setHoverEdge] = useState<DropEdge | null>(null)

  /** Read the dragged tab's id from a cross-pane payload, or null. */
  const readTabId = (e: React.DragEvent): string | null => {
    const raw = e.dataTransfer.getData(TAB_DRAG_MIME)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { tabId?: unknown }
      return typeof parsed.tabId === 'string' ? parsed.tabId : null
    } catch {
      return null
    }
  }

  const onEdgeDrop = (e: React.DragEvent, edge: DropEdge): void => {
    e.preventDefault()
    e.stopPropagation()
    setHoverEdge(null)
    const tabId = readTabId(e)
    if (!tabId || !generatePaneId) return
    const { direction } = EDGE_SPLIT[edge]
    dispatch({
      type: 'SPLIT_PANE_WITH_TAB',
      payload: { paneId: pane.id, direction, newPaneId: generatePaneId(), tabId },
    })
  }

  const edges: DropEdge[] = ['left', 'right', 'top', 'bottom']

  return (
    <div
      className={`pane-leaf${isActive ? ' pane-leaf--active' : ''}`}
      // Focus bubbles up from the tab bar / editor; a click anywhere in the
      // pane also claims focus. Capture phase so it runs before inner handlers.
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
    >
      {renderPane(pane, isActive, onFocus)}
      {/* Edge-drop zones: only active during a cross-pane tab drag. They sit
          above the pane content but are pointer-transparent until a drag with
          the tab MIME is in flight (the dragover check gates preventDefault),
          so ordinary clicks pass straight through. */}
      {generatePaneId && edges.map((edge) => (
        <div
          key={edge}
          className={`pane-drop-edge pane-drop-edge--${edge}${hoverEdge === edge ? ' pane-drop-edge--active' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setHoverEdge(edge)
          }}
          onDragLeave={() => setHoverEdge((cur) => (cur === edge ? null : cur))}
          onDrop={(e) => onEdgeDrop(e, edge)}
        />
      ))}
    </div>
  )
}

interface SplitContainerProps {
  split: SplitNode
  dispatch: Dispatch<PaneTreeAction>
  renderNode: (node: PaneTreeNode) => ReactNode
  resizeLabel: string
}

function SplitContainer({ split, dispatch, renderNode, resizeLabel }: SplitContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isHorizontal = split.direction === 'horizontal'

  // Getter, not a render-time read: the ref is measured only when a drag starts
  // (inside the handle's mouse handler), never during render — satisfies the
  // react-hooks/refs rule and always reflects the live size.
  const getAxisLength = (): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return isHorizontal ? rect.width : rect.height
  }

  const children: ReactNode[] = []
  split.children.forEach((child, i) => {
    children.push(
      <div
        key={`cell-${i}`}
        className="pane-split-cell"
        style={{ flexGrow: split.sizes[i] ?? 1, flexBasis: 0 }}
      >
        {renderNode(child)}
      </div>,
    )
    // A handle sits between adjacent children (not after the last).
    if (i < split.children.length - 1) {
      children.push(
        <PaneSplitHandle
          key={`handle-${i}`}
          direction={split.direction}
          ratio={split.sizes[i] ?? 0.5}
          getAxisLengthPx={getAxisLength}
          onResize={(ratio) => dispatch({ type: 'RESIZE_SPLIT', payload: { splitId: split.id, childIndex: i, ratio } })}
          label={resizeLabel}
        />,
      )
    }
  })

  return (
    <div ref={containerRef} className={`pane-split pane-split--${split.direction}`}>
      {children}
    </div>
  )
}
