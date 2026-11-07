// The Map view of one deck: its cards as a graph, connected by the design rules.

import React, { useEffect, useState, useMemo } from 'react'
import { Select, SegmentedControl, UnstyledButton } from "@mantine/core"
import { Link, useNavigate } from "react-router-dom"
import { linkCheckHref } from "../../shell/paths.js"
import { otherCardNames } from "../link/linkCheckModel.js"
import { useCube } from "../../contexts/CubeContext.js"
import { rankByDegree } from "../../utils/DeckGraph"
import { edgeColorFor, editorHref } from "./designData.js"
import { CardPageIcon } from "../../components/CardLink.js"
import { cardColor } from "../../components/map/nodeColors.js"
import { MapView } from "../../components/map/MapView.js"
import { deckCommunities } from "./deckCommunities.js"
import { CardPreview } from "./CardPreview.js"
import { MAP_COPY } from "./copy.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"

// CardSynergyMap renders an arbitrary pool of cards (e.g. a decklist) as a map
// wired by the design rules, scoped to the given cards. Hover previews a card;
// click pins the focus on it. focus, when set, is a group of cards to light up.
export function CardSynergyMap({ cards, edges, packages, focus }) {
  const cube = useCube()
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)
  const [hoveredCommunity, setHoveredCommunity] = useState(null)

  const packageIndex = useMemo(() => {
    const idx = {}
    ;(packages || []).forEach((l, i) => { idx[l.name] = i })
    return idx
  }, [packages])

  const byName = useMemo(() => new Map((cards || []).map(c => [c.name, c])), [cards])

  const [colorBy, setColorBy] = useState("identity")

  // Deck-subgraph analytics: the most-connected ranking, and the communities
  // with a color and package name each.
  const analytics = useMemo(() => {
    const { graph, list, colorOf } = deckCommunities([...byName.keys()], edges, packageIndex)
    return { ranking: rankByDegree(graph), communities: list, communityColorOf: colorOf }
  }, [byName, edges, packageIndex])

  const { simNodes, simEdges } = useMemo(() => {
    const names = new Set(byName.keys())
    const se = (edges || [])
      .filter(e => names.has(e.source) && names.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight, color: edgeColorFor(e.packages, packageIndex) }))
    // Size nodes by how connected they are within this pool, not the whole cube.
    const degree = {}
    for (const e of se) {
      degree[e.source] = (degree[e.source] || 0) + 1
      degree[e.target] = (degree[e.target] || 0) + 1
    }
    const max = Math.max(1, ...Object.values(degree))
    const sn = [...names].map(n => ({
      id: n,
      radius: Math.max(5, Math.min(12, 5 + ((degree[n] || 0) / max) * 7)),
      color: cardColor((byName.get(n) || {}).colors),
      communityColor: analytics.communityColorOf[n] || null,
      label: n,
    }))
    return { simNodes: sn, simEdges: se }
  }, [byName, edges, packageIndex, analytics])

  // Drop stale focus when the pool changes (deck or board switch).
  useEffect(() => { setHovered(null); setSelected(null); setHoveredCommunity(null) }, [byName])

  if (simNodes.length === 0) {
    return <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noCards}</p>
  }


  const topLinked = analytics.ranking.filter(r => r.weightedDegree > 0).slice(0, 8)

  // Neighbors of the pinned card in this pool, heaviest connection first. Feeds the
  // "Connected to" list, whose rows deep-link the pair into the design editor.
  const linkedTo = []
  if (selected) {
    const w = {}
    for (const e of simEdges) {
      if (e.source === selected) w[e.target] = (w[e.target] || 0) + e.weight
      else if (e.target === selected) w[e.source] = (w[e.source] || 0) + e.weight
    }
    linkedTo.push(...Object.entries(w)
      .map(([card, weight]) => ({ card, weight }))
      .sort((a, b) => b.weight - a.weight || (a.card < b.card ? -1 : 1)))
  }

  return (
    <div className="dm-deckmap-layout">
      <div className="dm-panel dm-map dm-deckmap-main">
        <div className="dm-map-toolbar">
          <span className="dm-map-toolbar-label">{MAP_COPY.cardSynergyMap.colorBy}</span>
          <SegmentedControl
            size="xs"
            aria-label={MAP_COPY.cardSynergyMap.colorBy}
            data={[{ value: "identity", label: MAP_COPY.cardSynergyMap.colorByIdentity }, { value: "community", label: MAP_COPY.cardSynergyMap.colorByCommunity }]}
            value={colorBy}
            onChange={setColorBy}
          />
        </div>
        <MapView
          nodes={simNodes}
          edges={simEdges}
          nodeColor={colorBy === "community" ? communityColor : identityColor}
          hoveredId={hovered}
          selectedId={selected}
          highlightIds={hoveredCommunity || focus}
          onHover={setHovered}
          onSelect={(id) => setSelected(prev => prev === id ? null : id)}
          renderHover={id => <CardPreview card={byName.get(id)} inline />}
        />
        <div className="dm-map-caption">
          {MAP_COPY.cardSynergyMap.caption({ cards: simNodes.length, links: simEdges.length, clusters: analytics.communities.length })}
        </div>
      </div>
      <aside className="dm-deckmap-side">
        <div className="dm-panel dm-deckmap-stats">
          <HoverInfo title={MAP_COPY.cardSynergyMap.mostConnected} info="Cards linked to the most others in this deck by the design rules, counting every package that links a pair.">
            <div className="dm-subhead">{MAP_COPY.cardSynergyMap.mostConnected}</div>
          </HoverInfo>
          {topLinked.length === 0 ? (
            <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noConnectedCards}</p>
          ) : topLinked.map(r => (
            <HoverInfo key={r.card} title={r.card} info={`${r.weightedDegree} package links to ${r.degree} of this deck's cards`}>
              <UnstyledButton
                className={"dm-legend-row" + (selected === r.card ? " dm-legend-on" : "")}
                onClick={() => setSelected(prev => prev === r.card ? null : r.card)}
                onMouseEnter={() => setHovered(r.card)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="dm-legend-name">{r.card}</span>
                <span className="dm-legend-count">{r.degree} cards</span>
              </UnstyledButton>
            </HoverInfo>
          ))}
          <div className="dm-subhead">{MAP_COPY.cardSynergyMap.communities}</div>
          {analytics.communities.length === 0 ? (
            <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noClusters}</p>
          ) : analytics.communities.map((c, i) => (
            <div
              key={i}
              className="dm-legend-row"
              onMouseEnter={() => setHoveredCommunity(new Set(c.members))}
              onMouseLeave={() => setHoveredCommunity(null)}
            >
              <span className="dm-swatch" style={{ background: c.color }} />
              <span className="dm-legend-name">{c.label || MAP_COPY.cardSynergyMap.mixedCommunity}</span>
              <span className="dm-legend-count">{c.size}</span>
            </div>
          ))}
        </div>
        {selected && (
          <div className="dm-panel dm-deckmap-stats">
            <div className="dm-linked-head">
              <span className="dm-legend-name">{selected}</span>
              <CardPageIcon cube={cube} name={selected} className="dm-editor-link" />
              <a className="dm-editor-link" href={editorHref(cube, selected)} target="_blank" rel="noopener noreferrer" title={MAP_COPY.cardSynergyMap.openInEditor}>⧉</a>
            </div>
            <Select
              size="xs"
              placeholder="Check a link with…"
              data={otherCardNames(byName, selected)}
              value={null}
              onChange={other => other && navigate(linkCheckHref(cube, selected, other))}
              searchable
              className="dm-link-check"
              comboboxProps={{ withinPortal: false }}
            />
            {linkedTo.length === 0 ? (
              <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noConnectionsInPool}</p>
            ) : (
              <>
                <div className="dm-subhead">{MAP_COPY.cardSynergyMap.connectedTo}</div>
                {linkedTo.map(n => (
                  <div key={n.card} className="dm-legend-row dm-legend-static">
                    <span className="dm-legend-name">{n.card}</span>
                    <span className="dm-legend-count">{n.weight}</span>
                    <CardPageIcon cube={cube} name={n.card} className="dm-editor-link" />
                    <Link className="dm-editor-link" to={linkCheckHref(cube, selected, n.card)} title={`Why ${selected} and ${n.card} are linked`}>Why?</Link>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

// identityColor colors a card node by its mana colors.
function identityColor(node) {
  return node.color
}

// communityColor colors a card node by the community it falls in.
function communityColor(node) {
  return node.communityColor
}
