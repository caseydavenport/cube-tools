// The Map view of one deck: its cards as a graph, linked by the design rules.

import React, { useEffect, useState, useMemo } from 'react'
import { SegmentedControl, UnstyledButton } from "@mantine/core"
import { useCube } from "../../contexts/CubeContext.js"
import { buildDeckSubgraph, rankByDegree, greedyModularityCommunities, dominantLabel, neutralColor } from "../../utils/DeckGraph"
import { RULE_COLORS, ruleColor } from "./ruleColors.js"
import { edgeColorFor, editorHref } from "./designData.js"
import { ForceGraph, cardColor } from "./ForceGraph.js"
import { CardPreview } from "./DrillMap.js"
import { MAP_COPY } from "./copy.js"

// CardSynergyMap renders an arbitrary pool of cards (e.g. a decklist) as a force
// graph wired by the design rules - the same engine as the design map, scoped to
// the given cards. Hover previews a card; click pins the focus on it.
export function CardSynergyMap({ cards, edges, links }) {
  const cube = useCube()
  const [hovered, setHovered] = useState(null)
  const [selected, setSelected] = useState(null)
  const [hoveredCommunity, setHoveredCommunity] = useState(null)

  const linkIndex = useMemo(() => {
    const idx = {}
    ;(links || []).forEach((l, i) => { idx[l.label] = i })
    return idx
  }, [links])

  const byName = useMemo(() => new Map((cards || []).map(c => [c.name, c])), [cards])

  const [colorBy, setColorBy] = useState("identity")

  // Deck-subgraph analytics: most-linked ranking, and communities with a color
  // and dominant rule label each. Multi-card communities get a palette color;
  // singletons and isolated cards stay neutral and aren't listed.
  const analytics = useMemo(() => {
    const names = [...byName.keys()]
    const g = buildDeckSubgraph(names, edges || [])
    const ranking = rankByDegree(g)
    const { communities, q } = greedyModularityCommunities(g)
    const communityColorOf = {}
    const list = []
    // Color each community by its label so a package looks the same across decks.
    // Communities come back largest-first; if a smaller one wants a color already
    // taken in this deck, bump it to the next free slot so the two stay distinct.
    const used = new Set()
    for (const comm of communities) {
      const label = comm.length >= 2 ? dominantLabel(g, comm) : ""
      if (!label) {
        for (const n of comm) communityColorOf[n] = neutralColor()
        continue
      }
      let color = ruleColor(linkIndex[label] ?? 0)
      if (used.has(color)) {
        const free = RULE_COLORS.find(c => !used.has(c))
        if (free) color = free
      }
      used.add(color)
      for (const n of comm) communityColorOf[n] = color
      list.push({ color, label, size: comm.length, members: comm })
    }
    return { ranking, communities: list, q, communityColorOf }
  }, [byName, edges, linkIndex])

  const { simNodes, simEdges } = useMemo(() => {
    const names = new Set(byName.keys())
    const se = (edges || [])
      .filter(e => names.has(e.source) && names.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight, color: edgeColorFor(e.rule_labels, linkIndex) }))
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
      communityColor: analytics.communityColorOf[n] || neutralColor(),
      label: n,
    }))
    return { simNodes: sn, simEdges: se }
  }, [byName, edges, linkIndex, analytics])

  // Drop stale focus when the pool changes (deck or board switch).
  useEffect(() => { setHovered(null); setSelected(null); setHoveredCommunity(null) }, [byName])

  if (simNodes.length === 0) {
    return <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noCards}</p>
  }

  const previewName = (hovered && byName.has(hovered)) ? hovered : selected
  const previewCard = previewName ? byName.get(previewName) : null

  const topLinked = analytics.ranking.filter(r => r.weightedDegree > 0).slice(0, 8)

  // Neighbors of the pinned card in this pool, heaviest link first. Feeds the
  // "Linked with" list, whose rows deep-link the pair into the design editor.
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
        <ForceGraph
          nodes={simNodes}
          edges={simEdges}
          showLabels={simNodes.length <= 34}
          colorBy={colorBy}
          hoveredId={hovered}
          selectedId={selected}
          highlightIds={hoveredCommunity}
          onHover={setHovered}
          onSelect={(id) => setSelected(prev => prev === id ? null : id)}
        />
        <div className="dm-map-caption">
          {MAP_COPY.cardSynergyMap.caption({ cards: simNodes.length, links: simEdges.length, clusters: analytics.communities.length, q: analytics.q.toFixed(2) })}
        </div>
      </div>
      <aside className="dm-deckmap-side">
        <div className="dm-panel dm-deckmap-stats">
          <div className="dm-subhead">{MAP_COPY.cardSynergyMap.mostLinked}</div>
          {topLinked.length === 0 ? (
            <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noLinkedCards}</p>
          ) : topLinked.map(r => (
            <UnstyledButton
              key={r.card}
              className={"dm-legend-row" + (selected === r.card ? " dm-legend-on" : "")}
              onClick={() => setSelected(prev => prev === r.card ? null : r.card)}
              onMouseEnter={() => setHovered(r.card)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="dm-legend-name">{r.card}</span>
              <span className="dm-legend-count">{r.weightedDegree}·{r.degree}</span>
            </UnstyledButton>
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
              <a className="dm-editor-link" href={editorHref(cube, selected)} target="_blank" rel="noopener noreferrer" title={MAP_COPY.cardSynergyMap.openInEditor}>⧉</a>
            </div>
            {linkedTo.length === 0 ? (
              <p className="dm-muted dm-pad">{MAP_COPY.cardSynergyMap.noLinksInPool}</p>
            ) : (
              <>
                <div className="dm-subhead">{MAP_COPY.cardSynergyMap.linkedWith}</div>
                {linkedTo.map(n => (
                  <div key={n.card} className="dm-legend-row dm-legend-static">
                    <span className="dm-legend-name">{n.card}</span>
                    <span className="dm-legend-count">{n.weight}</span>
                    <a className="dm-editor-link" href={editorHref(cube, selected, n.card)} target="_blank" rel="noopener noreferrer" title={MAP_COPY.cardSynergyMap.compareInEditor({ card: selected })}>⧉</a>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {previewCard && <CardPreview card={previewCard} />}
      </aside>
    </div>
  )
}
