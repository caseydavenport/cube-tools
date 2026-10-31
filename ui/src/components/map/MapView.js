// MapView draws a node-and-edge map with Sigma.js, a WebGL graph renderer.
// Pages hand it nodes, edges and a color rule; it lays them out, culls labels
// that would collide, dims everything but the hovered or pinned node, and can
// float a preview next to the hovered node.

import React, { useEffect, useMemo, useRef, useState } from "react"
import Sigma from "sigma"
import { useComputedColorScheme } from "@mantine/core"
import { blendHex, currentChartTheme, withAlpha } from "../../theme/chartTheme.js"
import { theme as appTheme } from "../../theme/theme.js"
import { buildMapGraph, layoutMap } from "./mapGraph.js"
import { previewSide } from "./hoverPlacement.js"
import "./mapView.css"

// MapView renders nodes ({ id, label, radius, color, quiet }) and edges
// ({ source, target, weight, color }); a quiet node's label shows only in
// focus. nodeColor(node) picks a node's color, null meaning
// the theme's muted gray; it defaults to node.color. The focus is selectedId,
// else hoveredId; a highlightIds set lights a whole group instead.
// renderHover(id) returns a preview, shown in the canvas corner away from the
// hovered node.
export function MapView({ nodes, edges, nodeColor, hoveredId, selectedId, highlightIds, onHover, onSelect, renderHover }) {
  // Reading the scheme re-renders on a light or dark switch, which repaints.
  const scheme = useComputedColorScheme("light")
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const [hoverSide, setHoverSide] = useState(null)

  // Layout runs only when the data changes, never on hover or a scheme switch.
  const graph = useMemo(() => {
    const built = buildMapGraph(nodes, edges)
    layoutMap(built)
    return built
  }, [nodes, edges])

  // Sigma's callbacks are created once per graph, so they read the latest
  // props through this ref instead of capturing stale ones.
  const latest = useRef({})
  latest.current = { graph, nodeColor, hoveredId, selectedId, highlightIds, onHover, onSelect }

  useEffect(() => {
    const container = containerRef.current
    const renderer = new Sigma(graph, container, {
      allowInvalidContainer: true,
      stagePadding: 44,
      labelDensity: 0.9,
      labelGridCellSize: 70,
      labelRenderedSizeThreshold: 6,
      labelSize: 13,
      labelFont: appTheme.fontFamily,
      labelWeight: "500",
      zIndex: true,
      defaultDrawNodeLabel: drawLabel,
      defaultDrawNodeHover: drawFocusRing,
      nodeReducer: (id, attrs) => styleNode(id, attrs, latest.current),
      edgeReducer: (id, attrs) => styleEdge(id, attrs, latest.current),
    })
    renderer.on("enterNode", ({ node }) => {
      if (latest.current.onHover) latest.current.onHover(node)
    })
    renderer.on("leaveNode", () => {
      if (latest.current.onHover) latest.current.onHover(null)
    })
    renderer.on("clickNode", ({ node }) => {
      if (latest.current.onSelect) latest.current.onSelect(node)
    })
    rendererRef.current = renderer

    // Refit when the container changes size, such as a sidebar collapse.
    const observer = new ResizeObserver(() => {
      renderer.resize()
      renderer.refresh()
    })
    observer.observe(container)

    return () => {
      // kill() sends no leaveNode, so clear the page's hover or it outlives the map.
      if (latest.current.onHover) latest.current.onHover(null)
      observer.disconnect()
      renderer.kill()
      rendererRef.current = null
    }
  }, [graph])

  // Repaint when the focus, the color rule or the scheme changes.
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.refresh()
    }
  }, [hoveredId, selectedId, highlightIds, nodeColor, scheme])

  // Pick the corner for the preview: the side of the canvas away from the
  // hovered node.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || !hoveredId || !renderHover) {
      setHoverSide(null)
      return
    }
    const data = renderer.getNodeDisplayData(hoveredId)
    if (!data) {
      setHoverSide(null)
      return
    }
    const point = renderer.framedGraphToViewport(data)
    setHoverSide(previewSide(point.x, containerRef.current.clientWidth))
  }, [hoveredId, renderHover, graph])

  return (
    <div className="map-view">
      <div ref={containerRef} className="map-view-canvas" />
      {hoverSide && <HoverPreview side={hoverSide}>{renderHover(hoveredId)}</HoverPreview>}
    </div>
  )
}

// HoverPreview shows its children in one top corner of the canvas, "left" or
// "right". It ignores the mouse, so it never blocks a click.
function HoverPreview({ side, children }) {
  if (!children) {
    return null
  }
  return <div className={"map-hover map-hover-" + side}>{children}</div>
}

// FADED is how far a node outside the focus fades into the card color.
const FADED = 0.82

// MAX_FORCED_LABELS is the most neighbors whose labels a focus forces on.
// Past that they'd pile up, so Sigma's usual label culling decides instead.
const MAX_FORCED_LABELS = 24

// styleNode decides how one node draws for the current focus. Nodes outside
// the focus fade and lose their label; the focus always shows its label, and
// so do its neighbors when there are few enough. A quiet node shows its label
// only then. The focus gets a ring.
// Fading blends toward the card color, since Sigma's WebGL drawing mishandles
// see-through colors.
function styleNode(id, attrs, state) {
  const theme = currentChartTheme()
  let fill = attrs.color
  if (state.nodeColor) {
    fill = state.nodeColor(attrs)
  }
  if (!fill) {
    fill = theme.muted
  }

  const styled = { ...attrs, color: fill }
  const highlight = activeHighlight(state)
  if (highlight) {
    if (!highlight.has(id)) {
      return { ...styled, color: blendHex(fill, theme.card, FADED), label: "", zIndex: 0 }
    }
    return { ...styled, zIndex: 1 }
  }

  const focus = focusOf(state)
  if (!focus) {
    if (attrs.quiet) {
      return { ...styled, label: "" }
    }
    return styled
  }
  if (id === focus) {
    return { ...styled, highlighted: true, forceLabel: true, zIndex: 2 }
  }
  if (state.graph.areNeighbors(id, focus)) {
    const fewNeighbors = state.graph.degree(focus) <= MAX_FORCED_LABELS
    return { ...styled, forceLabel: fewNeighbors, zIndex: 1 }
  }
  return { ...styled, color: blendHex(fill, theme.card, FADED), label: "", zIndex: 0 }
}

// styleEdge decides how one edge draws. At rest edges are faint so the nodes
// read first; with a focus, only the focus's edges (or a highlighted group's
// inner edges) show, a little stronger.
function styleEdge(id, attrs, state) {
  const theme = currentChartTheme()
  const base = attrs.color || theme.muted
  const weight = attrs.weight || 1
  const [source, target] = state.graph.extremities(id)

  const highlight = activeHighlight(state)
  const focus = focusOf(state)
  if (highlight) {
    if (!highlight.has(source) || !highlight.has(target)) {
      return { ...attrs, hidden: true }
    }
    return { ...attrs, color: blendHex(base, theme.card, 1 - Math.min(0.75, 0.28 + weight * 0.08)), size: 1.6 }
  }
  if (focus) {
    if (source !== focus && target !== focus) {
      return { ...attrs, hidden: true }
    }
    return { ...attrs, color: blendHex(base, theme.card, 1 - Math.min(0.75, 0.28 + weight * 0.08)), size: 1.6 }
  }
  return { ...attrs, color: blendHex(base, theme.card, 1 - Math.min(0.65, 0.36 + weight * 0.06)), size: Math.max(1, Math.min(2.5, weight * 0.4)) }
}

// activeHighlight returns the highlighted group, or null when there's none.
function activeHighlight(state) {
  if (state.highlightIds && state.highlightIds.size > 0) {
    return state.highlightIds
  }
  return null
}

// focusOf is the node the map centers on: the pinned one, else the hovered one.
function focusOf(state) {
  if (state.selectedId && state.graph.hasNode(state.selectedId)) {
    return state.selectedId
  }
  if (state.hoveredId && state.graph.hasNode(state.hoveredId)) {
    return state.hoveredId
  }
  return null
}

// drawLabel draws a node's label to its right, with a halo in the card color
// so it stays readable over edges. It reads the theme as it draws, so a
// scheme switch recolors labels.
function drawLabel(context, data, settings) {
  if (!data.label) {
    return
  }
  const theme = currentChartTheme()
  const x = data.x + data.size + 4
  const y = data.y + settings.labelSize / 3
  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`
  context.lineJoin = "round"
  context.lineWidth = 3
  context.strokeStyle = withAlpha(theme.card, 0.9)
  context.strokeText(data.label, x, y)
  context.fillStyle = theme.text
  context.fillText(data.label, x, y)
}

// drawFocusRing marks the hovered or pinned node with a ring in the text
// color, then draws its label. It replaces Sigma's default white label box,
// which is unreadable in dark mode.
function drawFocusRing(context, data, settings) {
  const theme = currentChartTheme()
  context.beginPath()
  context.arc(data.x, data.y, data.size + 3, 0, 2 * Math.PI)
  context.lineWidth = 2
  context.strokeStyle = theme.text
  context.stroke()
  drawLabel(context, data, settings)
}
