// The Synergy map's graph at each drill level (themes, a group, a card), and
// the card preview over it.

import React, { useRef, useEffect, useMemo } from 'react'
import { CardImageURL } from "../../utils/Utils.js"
import { cardRefName } from "../../utils/DesignRules.js"
import { edgeColorFor, whyLinked } from "./designData.js"
import { ForceGraph, cardColor, getNodeColor } from "./ForceGraph.js"
import { ruleColor } from "./ruleColors.js"
import { MAP_COPY } from "./copy.js"

// --- Drill map (the leveled constellation) -----------------------------------

export function DrillMap({ focus, nodeMap, edges, groupNodes, groupEdges, links, groupColor, cardGroups, cardData, hovered, onHover, onDrill }) {
  const mapRef = useRef(null)
  const tipRef = useRef(null)
  const linkIndex = {}
  links.forEach((l, i) => { linkIndex[l.label] = i })
  const linkByLabel = {}
  links.forEach(l => { linkByLabel[l.label] = l })

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
        <div ref={tipRef} className="dm-why-tip">
          <div className="dm-why-tip-head">
            <span className="dm-dot" style={{ background: getNodeColor((nodeMap[hovered] || {}).colors) }} />
            {hovered}
          </div>
          {why.map(w => (
            <div key={w.label} className="dm-why-rule">
              <div className="dm-why-rulelabel" style={{ color: ruleColor(linkIndex[w.label] ?? 0) }}>
                <span className="dm-swatch" style={{ background: ruleColor(linkIndex[w.label] ?? 0) }} /> {w.label}
              </div>
              {w.bridges.length === 0 && (
                <div className="dm-why-line dm-muted">{MAP_COPY.drillMap.sharedRule}</div>
              )}
              {w.bridges.map((b, i) => (
                <div key={i} className="dm-why-bridge">
                  <div className="dm-why-line">
                    <span className="dm-why-card">{focus.card}</span> {cardRefName(b.focusGroup) ? <b>{MAP_COPY.drillMap.linkedDirectly}</b> : <>{MAP_COPY.drillMap.inGroup} <b>{b.focusGroup}</b></>}
                    {b.focusConds[0] && <span className="dm-why-cond">{b.focusConds[0]}</span>}
                  </div>
                  <div className="dm-why-line">
                    <span className="dm-why-card">{hovered}</span> {cardRefName(b.neighGroup) ? <b>{MAP_COPY.drillMap.linkedDirectly}</b> : <>{MAP_COPY.drillMap.inGroup} <b>{b.neighGroup}</b></>}
                    {b.neighConds[0] && <span className="dm-why-cond">{b.neighConds[0]}</span>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// CardPreview overlays the hovered/selected card's actual image (or its rules text
// if no image is available), pinned to the bottom-right of the viewport.
export function CardPreview({ card }) {
  if (!card) return null
  return (
    <div className="dm-preview">
      {(card.image || card.url) ? (
        <img className="dm-preview-img" src={CardImageURL(card)} alt={card.name} />
      ) : (
        <div className="dm-preview-text">
          <div className="dm-preview-name">{card.name} <span className="dm-preview-mana">{card.mana_cost}</span></div>
          <div className="dm-preview-type">{[...(card.types || []), ...(card.sub_types || [])].join(" ")}</div>
          <div className="dm-preview-oracle">{card.oracle_text}</div>
        </div>
      )}
    </div>
  )
}
