import { useEffect, useRef, useState, useCallback } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force'
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import { useAppContext } from '../state'
import { useTabContext } from '../state/tabContext'
import { openTab } from '../state/tabActions'
import { useTranslation } from '../i18n'
import type { GraphData, GraphNode } from '../types'
import { truncateLabel, clampZoom, computeNodeSize, filterNodes } from './graph-utils'
import { RefreshCw, Search } from 'lucide-react'

/**
 * Props for the GraphView component.
 */
interface GraphViewProps {
  vaultId: string
}

/** Internal simulation node with position data. */
interface SimNode extends SimulationNodeDatum {
  id: string
  path: string
  label: string
  exists: boolean
  radius: number
  connections: number
}

/** Internal simulation link. */
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode | string
  target: SimNode | string
}

/**
 * GraphView renders the knowledge graph as an interactive SVG visualization
 * using d3-force for layout. Fetches graph data from the API on mount and
 * vault change.
 *
 * Features:
 * - Force-directed layout with charge repulsion and link attraction
 * - Node size proportional to connections
 * - Labels with truncation at 30 chars
 * - Visual distinction for unresolved links (exists=false)
 * - Zoom via mouse wheel, clamped to [0.1, 5.0]
 * - Pan via mouse drag on background
 * - Node drag with position fixing; double-click to release
 * - Hover: tooltip + highlight direct connections, dim others
 * - Click: open existing file in tab; no action for unresolved
 * - Search: case-insensitive substring filter, max 10 suggestions, center + highlight on select
 * - Loading indicator, error state with retry, empty state
 * - All colors via CSS Custom Properties
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function GraphView({ vaultId }: GraphViewProps) {
  const { apiClient, dispatch: appDispatch } = useAppContext()
  const { tabDispatch } = useTabContext()
  const { t } = useTranslation()

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [links, setLinks] = useState<SimLink[]>([])
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Zoom and pan state
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  // Interaction state refs (avoid re-renders during drag/pan)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panOffsetRef = useRef({ x: 0, y: 0 })

  const isDraggingRef = useRef(false)
  const dragNodeRef = useRef<SimNode | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  /** Tracks whether a drag actually moved (to suppress click after drag). */
  const didDragRef = useRef(false)

  // Hovered node for highlighting
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GraphNode[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedSearchNodeId, setHighlightedSearchNodeId] = useState<string | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null)

  /**
   * Fetches graph data from the API.
   */
  const fetchGraph = useCallback(async () => {
    if (!apiClient) return

    setLoading(true)
    setError(null)

    try {
      const data = await apiClient.getGraph(vaultId)
      setGraphData(data)
    } catch (err: unknown) {
      const message =
        err !== null && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : t('common.error')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, t])

  // Fetch graph data on mount and vault change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchGraph()
  }, [fetchGraph])

  // Observe container size for responsive SVG
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Build simulation nodes/links and run d3-force when graphData or dimensions change
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }

    if (!graphData || graphData.nodes.length === 0) {
      setNodes([]) // eslint-disable-line react-hooks/set-state-in-effect
      setLinks([]) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }

    // Count connections per node
    const connectionCount = new Map<string, number>()
    for (const node of graphData.nodes) {
      connectionCount.set(node.path, 0)
    }
    for (const edge of graphData.edges) {
      connectionCount.set(edge.source, (connectionCount.get(edge.source) ?? 0) + 1)
      connectionCount.set(edge.target, (connectionCount.get(edge.target) ?? 0) + 1)
    }

    const maxConnections = Math.max(...Array.from(connectionCount.values()), 0)

    // Create simulation nodes
    const simNodes: SimNode[] = graphData.nodes.map((node) => {
      const connections = connectionCount.get(node.path) ?? 0
      return {
        id: node.path,
        path: node.path,
        label: node.label,
        exists: node.exists,
        radius: computeNodeSize(connections, maxConnections),
        connections,
      }
    })

    // Create simulation links
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks: SimLink[] = graphData.edges
      .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
      }))

    // Initialize state
    setNodes(simNodes) // eslint-disable-line react-hooks/set-state-in-effect
    setLinks(simLinks) // eslint-disable-line react-hooks/set-state-in-effect

    // Run d3-force simulation
    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(30),
      )
      .force('charge', forceManyBody<SimNode>().strength(-50))
      .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2).strength(0.1))
      .force('collide', forceCollide<SimNode>().radius((d) => d.radius + 2))
      .alpha(1)
      .alphaDecay(0.02)

    simulation.on('tick', () => {
      // Force re-render by creating new array references
      setNodes([...simNodes])
      setLinks([...simLinks])
    })

    simulationRef.current = simulation

    return () => {
      simulation.stop()
    }
  }, [graphData, dimensions.width, dimensions.height])

  /**
   * Converts screen coordinates to SVG coordinates accounting for pan and zoom.
   */
  const screenToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const rect = svg.getBoundingClientRect()
      const x = (clientX - rect.left - panX) / zoom
      const y = (clientY - rect.top - panY) / zoom
      return { x, y }
    },
    [panX, panY, zoom],
  )

  /**
   * Handles mouse wheel for zoom, clamped to [0.1, 5.0].
   * Validates: Requirement 5.1
   */
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom((prev) => clampZoom(prev, delta))
    },
    [],
  )

  /**
   * Handles mouse down on SVG background to start panning.
   * Also handles mouse down on nodes to start dragging.
   * Validates: Requirements 5.2, 5.3
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Only handle left mouse button
      if (e.button !== 0) return

      // Check if the click target is a node (circle element with data-node-id)
      const target = e.target as Element
      const nodeGroup = target.closest('[data-node-id]')

      if (nodeGroup) {
        // Start node drag
        const nodeId = nodeGroup.getAttribute('data-node-id')
        const node = nodes.find((n) => n.id === nodeId)
        if (node) {
          isDraggingRef.current = true
          didDragRef.current = false
          dragNodeRef.current = node
          dragStartRef.current = screenToSvg(e.clientX, e.clientY)
          e.preventDefault()
        }
      } else {
        // Start panning on background
        isPanningRef.current = true
        panStartRef.current = { x: e.clientX, y: e.clientY }
        panOffsetRef.current = { x: panX, y: panY }
        e.preventDefault()
      }
    },
    [nodes, panX, panY, screenToSvg],
  )

  /**
   * Handles mouse move for panning and node dragging.
   */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x
        const dy = e.clientY - panStartRef.current.y
        setPanX(panOffsetRef.current.x + dx)
        setPanY(panOffsetRef.current.y + dy)
      } else if (isDraggingRef.current && dragNodeRef.current) {
        didDragRef.current = true
        const pos = screenToSvg(e.clientX, e.clientY)
        const node = dragNodeRef.current
        // Fix position in simulation
        node.fx = pos.x
        node.fy = pos.y
        node.x = pos.x
        node.y = pos.y

        // Reheat simulation slightly for smooth updates
        if (simulationRef.current) {
          simulationRef.current.alpha(0.1).restart()
        }
      }
    },
    [screenToSvg],
  )

  /**
   * Handles mouse up to stop panning or dragging.
   * When dragging ends, the node stays fixed at its new position.
   * Validates: Requirement 5.3
   */
  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false
    isDraggingRef.current = false
    dragNodeRef.current = null
  }, [])

  /**
   * Handles mouse leave on SVG to stop interactions.
   */
  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false
    isDraggingRef.current = false
    dragNodeRef.current = null
  }, [])

  /**
   * Handles double-click on a node to release it from fixed position.
   * Validates: Requirement 5.3
   */
  const handleNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: SimNode) => {
      e.preventDefault()
      e.stopPropagation()
      node.fx = null
      node.fy = null
      if (simulationRef.current) {
        simulationRef.current.alpha(0.3).restart()
      }
    },
    [],
  )

  /**
   * Handles click on a graph node.
   * Opens the file in a tab if it exists; does nothing for unresolved links.
   * Validates: Requirements 4.6, 4.7
   */
  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: SimNode) => {
      // Don't open tab if we were dragging
      if (didDragRef.current) return
      if (!node.exists || !apiClient) return

      e.stopPropagation()
      const fileName = node.path.split('/').pop() ?? node.path
      void openTab(tabDispatch, appDispatch, apiClient, vaultId, node.path, fileName)
    },
    [apiClient, tabDispatch, appDispatch, vaultId],
  )

  /**
   * Handles hover enter on a node.
   * Validates: Requirements 5.4, 5.5
   */
  const handleNodeHoverEnter = useCallback((nodeId: string) => {
    setHoveredNodeId(nodeId)
  }, [])

  /**
   * Handles hover leave on a node.
   * Validates: Requirement 5.6
   */
  const handleNodeHoverLeave = useCallback(() => {
    setHoveredNodeId(null)
  }, [])

  /**
   * Determines if an edge is connected to the hovered node.
   */
  const isEdgeConnectedToHovered = useCallback(
    (link: SimLink): boolean => {
      if (!hoveredNodeId) return false
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      return sourceId === hoveredNodeId || targetId === hoveredNodeId
    },
    [hoveredNodeId],
  )

  /**
   * Gets the edge opacity based on hover state.
   * Connected edges get full opacity; others get 20%.
   * Validates: Requirements 5.5, 5.6
   */
  const getEdgeOpacity = useCallback(
    (link: SimLink): number => {
      if (!hoveredNodeId) return 0.6 // default opacity
      return isEdgeConnectedToHovered(link) ? 1 : 0.2
    },
    [hoveredNodeId, isEdgeConnectedToHovered],
  )

  /**
   * Gets the edge stroke color based on hover state.
   * Connected edges get accent color; others keep default.
   */
  const getEdgeStroke = useCallback(
    (link: SimLink): string | undefined => {
      if (!hoveredNodeId) return undefined
      return isEdgeConnectedToHovered(link) ? 'var(--graph-edge-highlight, var(--accent))' : undefined
    },
    [hoveredNodeId, isEdgeConnectedToHovered],
  )

  /**
   * Handles search input change. Filters nodes and shows dropdown.
   * Validates: Requirements 9.2, 9.4
   */
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value
      setSearchQuery(query)

      if (query.trim() === '') {
        setSearchResults([])
        setShowDropdown(false)
        return
      }

      const results = filterNodes(query, graphData?.nodes ?? [])
      setSearchResults(results)
      setShowDropdown(true)
    },
    [graphData],
  )

  /**
   * Handles selection of a node from the search dropdown.
   * Centers the graph on the selected node and highlights it.
   * Validates: Requirement 9.3
   */
  const handleSearchSelect = useCallback(
    (selectedNode: GraphNode) => {
      // Find the simulation node to get its current position
      const simNode = nodes.find((n) => n.id === selectedNode.path)
      if (!simNode || simNode.x == null || simNode.y == null) return

      // Center the graph on the selected node
      const newPanX = dimensions.width / 2 - simNode.x * zoom
      const newPanY = dimensions.height / 2 - simNode.y * zoom
      setPanX(newPanX)
      setPanY(newPanY)

      // Highlight the node
      setHighlightedSearchNodeId(selectedNode.path)

      // Close dropdown and clear search
      setShowDropdown(false)
      setSearchQuery('')
      setSearchResults([])
    },
    [nodes, dimensions.width, dimensions.height, zoom],
  )

  /**
   * Handles Escape key to close dropdown.
   */
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setShowDropdown(false)
        setSearchQuery('')
        setSearchResults([])
      }
    },
    [],
  )

  // Close dropdown when clicking outside the search container
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  /**
   * Determines if a node is directly connected to the hovered node.
   * A node is connected if there's an edge between it and the hovered node,
   * or if it IS the hovered node.
   */
  const isNodeConnectedToHovered = useCallback(
    (nodeId: string): boolean => {
      if (!hoveredNodeId) return true
      if (nodeId === hoveredNodeId) return true
      for (const link of links) {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id
        const targetId = typeof link.target === 'string' ? link.target : link.target.id
        if (
          (sourceId === hoveredNodeId && targetId === nodeId) ||
          (targetId === hoveredNodeId && sourceId === nodeId)
        ) {
          return true
        }
      }
      return false
    },
    [hoveredNodeId, links],
  )

  /**
   * Gets the node opacity based on hover state.
   * Connected nodes and the hovered node get full opacity; others get 20%.
   * Validates: Requirements 5.5, 5.6
   */
  const getNodeOpacity = useCallback(
    (nodeId: string): number => {
      if (!hoveredNodeId) return 1
      return isNodeConnectedToHovered(nodeId) ? 1 : 0.2
    },
    [hoveredNodeId, isNodeConnectedToHovered],
  )

  // Loading state
  if (loading) {
    return (
      <div className="graph-view-status" role="status" aria-live="polite">
        <span className="app-loading-spinner" aria-hidden="true" />
        <span className="graph-view-loading">{t('common.loading')}</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="graph-view-status" role="alert">
        <p className="graph-view-error">{error}</p>
        <button className="graph-view-retry" onClick={() => void fetchGraph()}>
          <RefreshCw size={14} />
          <span>{t('graph.retry')}</span>
        </button>
      </div>
    )
  }

  // Empty graph
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-view-status">
        <p className="graph-view-empty">{t('graph.empty')}</p>
      </div>
    )
  }

  return (
    <div className="graph-view-container" ref={containerRef}>
      {/* Search UI — positioned absolutely over the SVG */}
      <div className="graph-search-container" ref={searchContainerRef}>
        <div className="graph-search-input-wrapper">
          <Search size={14} className="graph-search-icon" />
          <input
            type="text"
            className="graph-search-input"
            placeholder="Suchen…"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        {showDropdown && (
          <div className="graph-search-dropdown">
            {searchResults.length > 0 ? (
              searchResults.map((result) => (
                <button
                  key={result.path}
                  className="graph-search-item"
                  onClick={() => handleSearchSelect(result)}
                  type="button"
                >
                  {result.label}
                </button>
              ))
            ) : (
              <div className="graph-search-no-results">Keine Ergebnisse</div>
            )}
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        className="graph-view-svg"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isPanningRef.current ? 'grabbing' : 'grab', width: '100%', height: '100%' }} // eslint-disable-line react-hooks/refs
      >
        {/* Transform group for zoom and pan */}
        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* Edges */}
          <g className="graph-view__edges">
            {links.map((link, i) => {
              const source = link.source as SimNode
              const target = link.target as SimNode
              if (source.x == null || source.y == null || target.x == null || target.y == null) return null
              const opacity = getEdgeOpacity(link)
              const stroke = getEdgeStroke(link)
              return (
                <line
                  key={`edge-${i}`}
                  className="graph-edge"
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  style={{
                    strokeOpacity: opacity,
                    ...(stroke ? { stroke } : {}),
                    ...(hoveredNodeId && isEdgeConnectedToHovered(link) ? { strokeWidth: 2 } : {}),
                  }}
                />
              )
            })}
          </g>

          {/* Nodes */}
          <g className="graph-view__nodes">
            {nodes.map((node) => {
              if (node.x == null || node.y == null) return null
              const nodeOpacity = getNodeOpacity(node.id)
              const isSearchHighlighted = highlightedSearchNodeId === node.id
              const displayRadius = isSearchHighlighted ? node.radius * 1.5 : node.radius
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className={`${node.exists ? 'graph-node' : 'graph-node-unresolved'}${isSearchHighlighted ? ' graph-node-search-highlight' : ''}`}
                  onClick={(e) => handleNodeClick(e, node)}
                  onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
                  onMouseEnter={() => handleNodeHoverEnter(node.id)}
                  onMouseLeave={handleNodeHoverLeave}
                  style={{ cursor: node.exists ? 'pointer' : 'default', opacity: nodeOpacity }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={displayRadius}
                    style={isSearchHighlighted ? {
                      stroke: 'var(--graph-search-highlight)',
                      strokeWidth: 3,
                    } : undefined}
                  >
                    <title>{node.path}</title>
                  </circle>
                </g>
              )
            })}
          </g>
        </g>

        {/* Labels rendered OUTSIDE the zoom transform group for crisp text */}
        <g className="graph-view__labels">
          {nodes.map((node) => {
            if (node.x == null || node.y == null) return null
            const label = truncateLabel(node.path)
            const nodeOpacity = getNodeOpacity(node.id)
            const isSearchHighlighted = highlightedSearchNodeId === node.id
            const displayRadius = isSearchHighlighted ? node.radius * 1.5 : node.radius
            // Calculate screen position: apply zoom and pan manually
            const screenX = node.x * zoom + panX
            const screenY = (node.y + displayRadius + 12) * zoom + panY
            // Scale font size with zoom so labels don't dominate when zoomed out
            const fontSize = 11 * zoom
            // Hide labels when they'd be too small to read
            if (fontSize < 3) return null
            return (
              <text
                key={`label-${node.id}`}
                x={screenX}
                y={screenY}
                className="graph-label"
                textAnchor="middle"
                style={{ opacity: nodeOpacity, fontSize: `${fontSize}px` }}
              >
                {label}
              </text>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
