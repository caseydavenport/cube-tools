// The Synergy map's graph at each drill level (themes, a group, a card), and
// the card preview over it.

import React, { useRef, useEffect, useMemo } from 'react'
import { CardImageURL } from "../../utils/Utils.js"
import { cardRefName } from "../../utils/DesignRules.js"
import { edgeColorFor, whyLinked } from "./designData.js"
import { ForceGraph, cardColor, getNodeColor } from "./ForceGraph.js"
import { ruleColor } from "./ruleColors.js"
import { MAP_COPY } from "./copy.js"
import { Loom, bridgeLoom } from "../Loom.js"
import { PopTitle } from "../../components/kit/HoverInfo.js"

// --- Drill map (the leveled constellation) -----------------------------------

export function DrillMap({ focus, nodeMap, edges, groupNodes, groupEdges, links, groupColor, cardGroups, cardData, hovered, onHover, onDrill }) {
  const mapRef = useRef(null)
  const tipRef = useRef(null)
  const linkIndex = {}
  links.forEach((l, i) => { linkIndex[l.label] = i })
  const linkByLabel = {}
  links.forEach(l => { linkByLabel[l.label] = l })
  // Indexed as the map's groupColor is, so tip chips match the legend.
  const groupIndex = {}
  groupNodes.forEach((g, i) => { groupIndex[g.name] = i })

  // At card level, hovering a neighbor explains exactly why it links to the focused
  // card: the specific rule, plus which group each card sits in and the condition
  // that matched. Recomputed only when the hovered neighbor changes.
  const why = useMemo(() => {
    if (focus.level !== "card" || !hovered || hovered === focus.card) return null
    const w = whyLinked(focus.card, hovered, edges, linkByLabel, cardGroups || {})
    return w.length > 0 ? w : null
  }, [focus, hovered, edges, cardGroups])

  // Position the tooltip at the cursor without re-rendering (avoids disturbing the sim).
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    function move(e) {
      const tip = tipRef.current
      if (!tip) return
      const rect = el.getBoundingClientRect()
      let x = e.clientX - rect.left + 14
      let y = e.clientY - rect.top + 14
      // Keep the tooltip inside the map panel.
      const tw = tip.offsetWidth, th = tip.offsetHeight
      if (x + tw > rect.width) x = e.clientX - rect.left - tw - 14
      if (y + th > rect.height) y = Math.max(4, rect.height - th - 4)
      tip.style.left = x + "px"
      tip.style.top = y + "px"
    }
    el.addEventListener("mousemove", move)
    return () => el.removeEventListener("mousemove", move)
  }, [])

  // Build the node/edge set for the current drill level.
  const { simNodes, simEdges, showLabels, caption } = useMemo(() => {
    if (focus.level === "themes") {
      const max = groupNodes.reduce((m, g) => Math.max(m, g.card_count), 1)
      const sn = groupNodes.map(g => {
        // Card: wire refs appear as small card-colored satellites among the themes.
        const refName = cardRefName(g.name)
        if (refName) {
          return {
            id: g.name,
            radius: 8,
            color: cardColor((nodeMap[refName] || {}).colors),
            label: refName,
          }
        }
        return {
          id: g.name,
          radius: Math.max(10, Math.min(38, 10 + (g.card_count / max) * 28)),
          color: groupColor(g.name),
          label: g.name,
          count: g.card_count,
        }
      })
      const se = groupEdges.map(e => ({
        source: e.source, target: e.target, weight: e.weight,
        color: edgeColorFor(e.labels, linkIndex),
      }))
      const nRefs = sn.filter(n => cardRefName(n.id)).length
      let themesCaption = MAP_COPY.drillMap.captionThemes({ themes: sn.length })
      if (nRefs) {
        themesCaption = MAP_COPY.drillMap.captionThemesAndCards({ themes: sn.length - nRefs, cards: nRefs })
      }
      return { simNodes: sn, simEdges: se, showLabels: true, caption: themesCaption }
    }

    if (focus.level === "group") {
      const g = groupNodes.find(x => x.name === focus.group)
      const names = new Set(g ? g.cards : [])
      const max = [...names].reduce((m, n) => Math.max(m, (nodeMap[n]?.connection_count) || 0), 1)
      const sn = [...names].map(n => {
        const c = nodeMap[n] || { colors: [], connection_count: 0 }
        return {
          id: n,
          radius: Math.max(6, Math.min(18, 6 + ((c.connection_count || 0) / max) * 12)),
          color: cardColor(c.colors),
          label: n,
        }
      })
      const se = edges
        .filter(e => names.has(e.source) && names.has(e.target))
        .map(e => ({ source: e.source, target: e.target, weight: e.weight, color: edgeColorFor(e.rule_labels, linkIndex) }))
      return { simNodes: sn, simEdges: se, showLabels: sn.length <= 34, caption: MAP_COPY.drillMap.captionGroup({ cards: sn.length, group: focus.group }) }
    }

    // card level: the focused card and its direct neighbors.
    const center = focus.card
    const nbrs = new Set([center])
    // Edges can reach cards cut from the cube (they carry edges so old decks
    // stay connected). The cube editor only shows cube cards, so skip neighbors
    // absent from nodeMap.
    for (const e of edges) {
      if (e.source === center && nodeMap[e.target]) nbrs.add(e.target)
      else if (e.target === center && nodeMap[e.source]) nbrs.add(e.source)
    }
    const sn = [...nbrs].map(n => {
      const c = nodeMap[n] || { colors: [] }
      return {
        id: n,
        radius: n === center ? 16 : 9,
        color: cardColor(c.colors),
        label: n,
      }
    })
    const se = edges
      .filter(e => nbrs.has(e.source) && nbrs.has(e.target) && (e.source === center || e.target === center))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight, color: edgeColorFor(e.rule_labels, linkIndex) }))
    return { simNodes: sn, simEdges: se, showLabels: true, caption: MAP_COPY.drillMap.captionCard({ cards: sn.length - 1, card: center }) }
  }, [focus, groupNodes, groupEdges, edges, nodeMap])

  return (
    <div className="dm-panel dm-map" ref={mapRef}>
      <ForceGraph
        nodes={simNodes}
        edges={simEdges}
        showLabels={showLabels}
        hoveredId={hovered}
        selectedId={focus.level === "card" ? focus.card : null}
        onHover={onHover}
        onSelect={(id) => {
          if (focus.level === "themes") {
            const refName = cardRefName(id)
            if (refName) onDrill({ level: "card", card: refName })
            else onDrill({ level: "group", group: id })
          } else {
            onDrill({ level: "card", card: id })
          }
        }}
      />
      <div className="dm-map-caption">{caption}</div>
      {(() => {
        // Preview the hovered card, or the focused card when nothing's hovered.
        // At themes level a hovered card: ref previews the card it names.
        const hoveredName = hovered && (cardData[hovered] ? hovered : cardRefName(hovered))
        const name = (hoveredName && cardData[hoveredName]) ? hoveredName : (focus.level === "card" ? focus.card : null)
        const card = name ? cardData[name] : null
        return card ? <CardPreview card={card} /> : null
      })()}
      {why && (
        <WhyLinkedTip
          tipRef={tipRef} focusCard={focus.card} hovered={hovered} why={why}
          nodeMap={nodeMap} groupIndex={groupIndex} linkIndex={linkIndex}
        />
      )}
    </div>
  )
}

// WhyLinkedTip explains why the hovered card links to the focused card, as a
// picture: the focused card's groups on the left, the hovered card's on the
// right, one thread per bridge colored by its link, and a legend of the links.
// A link with no bridges between groups shows in the legend as a shared rule.
function WhyLinkedTip({ tipRef, focusCard, hovered, why, nodeMap, groupIndex, linkIndex }) {
  const bridged = why.filter(w => w.bridges.length > 0)
  const { left, right, threads } = bridgeLoom(bridged, groupIndex, linkIndex)

  return (
    <div ref={tipRef} className="kit-pop dm-why-tip">
      <PopTitle
        lead={<CardDot card={nodeMap[focusCard]} />}
        title={
          <span className="dm-why-pair">
            <span>{focusCard}</span>
            <span className="dm-why-swap">{MAP_COPY.drillMap.between}</span>
            <CardDot card={nodeMap[hovered]} />
            <span>{hovered}</span>
          </span>
        }
        badge={MAP_COPY.drillMap.linkCount({ count: why.length })}
      />
      {bridged.length > 0 && (
        <>
          <div className="dm-why-cols">
            <span>{MAP_COPY.drillMap.cardGroups({ card: focusCard })}</span>
            <span>{MAP_COPY.drillMap.cardGroups({ card: hovered })}</span>
          </div>
          <Loom left={left} right={right} threads={threads} compact />
        </>
      )}
      <div className="dm-why-legend">
        {why.map(w => <WhyLegendEntry key={w.label} link={w} color={ruleColor(linkIndex[w.label] ?? 0)} />)}
      </div>
    </div>
  )
}

// CardDot is a card's color dot, as the map draws its node.
function CardDot({ card }) {
  return <span className="dm-dot" style={{ background: getNodeColor((card || {}).colors) }} />
}

// WhyLegendEntry is one link in the tip's legend: a short bar in the link's
// color and its label, marked as a shared rule when it has no bridges.
function WhyLegendEntry({ link, color }) {
  return (
    <span className="dm-why-key">
      <span className="dm-why-bar" style={{ background: color }} />
      {link.label}
      {link.bridges.length === 0 && <span className="dm-why-shared">{MAP_COPY.drillMap.sharedRule}</span>}
    </span>
  )
}

// CardPreview overlays the hovered/selected card's actual image (or its rules text
// if no image is available), pinned to the bottom-right of the viewport.
export function CardPreview({ card }) {
  if (!card) return null
  return (
    <div className="dm-preview">
      {(card.image || card.url) ? (
        <img className="kit-card-image dm-preview-img" src={CardImageURL(card)} alt={card.name} />
      ) : (
        <div className="kit-pop dm-preview-text">
          <div className="dm-preview-name">{card.name} <span className="dm-preview-mana">{card.mana_cost}</span></div>
          <div className="dm-preview-type">{[...(card.types || []), ...(card.sub_types || [])].join(" ")}</div>
          <div className="dm-preview-oracle">{card.oracle_text}</div>
        </div>
      )}
    </div>
  )
}
