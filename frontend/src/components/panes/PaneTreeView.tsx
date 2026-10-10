import { useRef, type ReactNode } from 'react'
import type { Dispatch } from 'react'
import type { PaneTree, PaneTreeNode, PaneNode, SplitNode, PaneTreeAction } from '../../state/paneTreeState'
import { PaneSplitHandle } from './PaneSplitHandle'
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
}

/** Recursively render the pane tree into nested flex containers. */
export function PaneTreeView({ tree, dispatch, renderPane, resizeLabel }: PaneTreeViewProps) {
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
}

function PaneLeaf({ pane, isActive, onFocus, renderPane }: PaneLeafProps) {
  return (
    <div
      className={`pane-leaf${isActive ? ' pane-leaf--active' : ''}`}
      // Focus bubbles up from the tab bar / editor; a click anywhere in the
      // pane also claims focus. Capture phase so it runs before inner handlers.
      onMouseDownCapture={onFocus}
      onFocusCapture={onFocus}
    >
      {renderPane(pane, isActive, onFocus)}
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
