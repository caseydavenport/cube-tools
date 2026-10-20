// The force-directed graph both maps draw with, and the colors of its nodes.

import React, { useRef, useEffect, useState, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceX, forceY, forceCollide } from 'd3-force-3d'
import { useComputedColorScheme } from "@mantine/core"
import { White, Blue, Black, Red, Green } from "../../utils/Colors.js"
import { currentChartTheme, seriesColor, withAlpha } from "../../theme/chartTheme.js"
import { MAP_COPY } from "./copy.js"

// ForceGraph is a force-directed canvas renderer built on react-force-graph-2d.
// It draws whatever nodes and edges it's handed - theme constellation, a group's
// cards, or a card's neighborhood - so every drill level shares one engine.
// Nodes: {id, radius, color, label, count?, communityColor?}. Edges: {source,
// target, weight, color?}. The library owns the physics, pan/zoom, and drag; we
// keep the look by painting the nodes and edges ourselves.
export function ForceGraph({ nodes, edges, showLabels, colorBy, hoveredId, selectedId, highlightIds, onHover, onSelect }) {
  // Reading the color scheme re-renders the graph when it changes, which hands
  // the library new paint functions and repaints in the new colors. The node
  // layout is kept, since the graph data doesn't change.
  useComputedColorScheme("light")

  const fgRef = useRef(null)
  const containerRef = useRef(null)
  const [size, setSize] = useState({ width: 900, height: 620 })

  // Fit the canvas to its column.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function measure() {
      const w = el.clientWidth, h = el.clientHeight
      if (w > 0 && h > 0) setSize({ width: w, height: h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The library mutates node/link objects in place (adds x/y/vx/vy, swaps link
  // endpoints for node refs), so hand it fresh copies whenever the data changes.
  const graphData = useMemo(() => {
    const ids = new Set(nodes.map(n => n.id))
    return {
      nodes: nodes.map(n => ({ ...n })),
      links: edges
        .filter(e => ids.has(e.source) && ids.has(e.target))
        .map(e => ({ source: e.source, target: e.target, weight: e.weight || 1, color: e.color })),
    }
  }, [nodes, edges])

  const adjacency = useMemo(() => {
    const ids = new Set(nodes.map(n => n.id))
    const adj = {}
    for (const e of edges) {
      if (!ids.has(e.source) || !ids.has(e.target)) continue
      ;(adj[e.source] = adj[e.source] || new Set()).add(e.target)
      ;(adj[e.target] = adj[e.target] || new Set()).add(e.source)
    }
    return adj
  }, [nodes, edges])

  // A gentle pull toward center keeps disconnected nodes near the pack instead of
  // drifting to the edge, and collision keeps nodes from overlapping.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.d3Force("x", forceX(0).strength(0.07))
    fg.d3Force("y", forceY(0).strength(0.07))
    fg.d3Force("collide", forceCollide(n => (n.radius || 6) + 14))
    const charge = fg.d3Force("charge")
    if (charge) charge.strength(-220)
    const link = fg.d3Force("link")
    if (link) link.distance(46)
    fg.d3ReheatSimulation()
  }, [graphData])

  // Frame the whole graph once per dataset, after its layout settles. Only the
  // first settle fits - later reheats (from dragging) leave the user's view alone.
  const fittedRef = useRef(false)
  useEffect(() => { fittedRef.current = false }, [graphData])

  // Paint callbacks read the focus state directly, so a new closure is handed to
  // the library whenever hover/selection/colorBy change - that's what drives a
  // repaint. A highlight set (a hovered community) lights a whole group and wins
  // over single-node focus; otherwise focusId is the selected node, or the hovered
  // one when nothing's pinned.
  const hlSet = highlightIds && highlightIds.size > 0 ? highlightIds : null
  const focusId = hlSet ? null : (selectedId || hoveredId)
  const neighbors = focusId ? adjacency[focusId] : null

  const paintNode = (node, ctx, globalScale) => {
    const theme = currentChartTheme()
    const isFocus = node.id === focusId
    const isNeighbor = neighbors && neighbors.has(node.id)
    const dimmed = hlSet ? !hlSet.has(node.id) : (focusId && !isFocus && !isNeighbor)
    let fill = node.color
    if (colorBy === "community" && node.communityColor) {
      fill = node.communityColor
    } else if (fill === null) {
      fill = theme.muted
    }
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI)
    ctx.fillStyle = dimmed ? withAlpha(fill, 0.18) : fill
    ctx.fill()
    ctx.lineWidth = (isFocus ? 2.5 : 1) / globalScale
    ctx.strokeStyle = nodeRing(theme, isFocus, dimmed)
    ctx.stroke()

    // Labels: all of them when showLabels, otherwise just the focused/hovered one.
    const show = isFocus || (showLabels && !dimmed)
    if (!show) return
    const fontSize = Math.max(9, 12 / globalScale)
    ctx.font = `${fontSize}px Inter, sans-serif`
    ctx.textAlign = "center"
    ctx.lineJoin = "round"
    const text = node.count != null ? MAP_COPY.forceGraph.nodeLabelWithCount({ label: node.label, count: node.count }) : node.label
    const ty = node.y - node.radius - 5 / globalScale
    // A halo in the page color keeps the label readable over links and nodes.
    ctx.lineWidth = 3 / globalScale
    ctx.strokeStyle = withAlpha(theme.background, 0.9)
    ctx.strokeText(text, node.x, ty)
    ctx.fillStyle = labelColor(theme, isFocus)
    ctx.fillText(text, node.x, ty)
  }

  // Hit area for hover/click - a disc matching the drawn node.
  const paintPointerArea = (node, color, ctx) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x, node.y, node.radius + 2, 0, 2 * Math.PI)
    ctx.fill()
  }

  const paintLink = (link, ctx, globalScale) => {
    const s = link.source, t = link.target
    if (!s || !t || typeof s !== "object" || typeof t !== "object") return
    const touches = hlSet
      ? (hlSet.has(s.id) && hlSet.has(t.id))
      : (focusId && (s.id === focusId || t.id === focusId))
    const dimmed = (hlSet || focusId) && !touches
    const base = link.color || currentChartTheme().muted
    // At rest the web stays subdued so the nodes still read as a constellation;
    // focusing a node lights up just the edges that touch it, and a hovered
    // community lights the edges inside it.
    let alpha
    if (dimmed) alpha = 0.03
    else if (hlSet || focusId) alpha = Math.min(0.75, 0.28 + link.weight * 0.08)
    else alpha = Math.min(0.55, 0.26 + link.weight * 0.05)
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = withAlpha(base, alpha)
    ctx.lineWidth = (touches ? 1.6 : Math.max(1, Math.min(2.5, link.weight * 0.4))) / globalScale
    ctx.stroke()
  }

  return (
    <div ref={containerRef} className="dm-canvaswrap">
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="transparent"
        cooldownTicks={200}
        d3VelocityDecay={0.3}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={paintPointerArea}
        linkCanvasObject={paintLink}
        onNodeHover={node => { if (onHover) onHover(node ? node.id : null) }}
        onNodeClick={node => { if (onSelect && node) onSelect(node.id) }}
        onEngineStop={() => {
          if (!fittedRef.current && fgRef.current) { fgRef.current.zoomToFit(400, 40); fittedRef.current = true }
        }}
      />
    </div>
  )
}

// nodeRing is a node's outline: the text color on the focused node, and a
// faint text color, fainter still when dimmed, on the rest.
function nodeRing(theme, isFocus, dimmed) {
  if (isFocus) {
    return theme.text
  }
  if (dimmed) {
    return withAlpha(theme.text, 0.15)
  }
  return withAlpha(theme.text, 0.35)
}

// labelColor is a node label's color: full text color when focused, slightly
// softer otherwise.
function labelColor(theme, isFocus) {
  if (isFocus) {
    return theme.text
  }
  return withAlpha(theme.text, 0.85)
}

// cardColor is the color a graph node keeps for a card, or null for a
// colorless card: its gray follows the color scheme, so the paint callback
// picks it at draw time instead of the node holding a stale one.
export function cardColor(colors) {
  if (!colors || colors.length === 0) {
    return null
  }
  return getNodeColor(colors)
}

// getNodeColor colors a card by its color identity: its mana color for mono,
// gold for multicolor, muted for colorless.
export function getNodeColor(colors) {
  // Must be 6-digit hex: withAlpha slices out the channel pairs, and a
  // 3-digit form produces an invalid rgba() that canvas silently ignores.
  if (!colors || colors.length === 0) return currentChartTheme().muted
  if (colors.length > 1) return seriesColor(2)
  switch (colors[0]) {
    case "W": return White
    case "U": return Blue
    case "B": return Black
    case "R": return Red
    case "G": return Green
    default: return currentChartTheme().muted
  }
}
