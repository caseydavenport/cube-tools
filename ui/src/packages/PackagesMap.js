// The Packages index's Map view: one node per package, joined where two
// packages share a group, beside the cards that sit in the most packages.

import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CardLink } from "../components/CardLink.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { MapView } from "../components/map/MapView.js"
import { cardColor } from "../components/map/nodeColors.js"
import { packagePageHref } from "../shell/paths.js"
import { builtInText, edgeList, mapNodes, sharedGroupsOf } from "./packagesModel.js"

// nodeColor paints a package by its main Magic color, or the theme's gray for
// a package without one.
function nodeColor(node) {
  if (!node.color) {
    return cardColor([])
  }
  return cardColor([node.color])
}

// PackageHover is the preview for a hovered package: its builds or card
// count, and the packages it shares groups with.
function PackageHover({ stat, edges, hasDecks }) {
  const shared = sharedGroupsOf(stat.name, edges)
  let size = `${stat.cardCount} cards`
  if (hasDecks) {
    size = `Built in ${builtInText(stat)}`
  }
  return (
    <div className="kit-card packages-map-hover">
      <div className="packages-map-hover-title">{stat.name}</div>
      <div className="packages-map-hover-line">{size}</div>
      {shared.length > 0 && <div className="packages-map-hover-head">Shares groups with</div>}
      {shared.map(s => (
        <div key={s.name} className="packages-map-hover-line">
          {s.name}: {s.groups.join(", ")}
        </div>
      ))}
    </div>
  )
}

// MostLinked lists the cube cards in the most packages, each linking to its
// card page.
function MostLinked({ cards, cube }) {
  if (cards.length === 0) {
    return null
  }
  const title = (
    <HoverInfo title="Most linked cards" info="Cube cards in the most packages.">
      <span>Most linked cards</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      {cards.map(c => (
        <div key={c.name} className="packages-linked-row">
          <CardLink cube={cube} name={c.name} className="packages-linked-name" />
          <span className="packages-linked-count">{c.count}</span>
        </div>
      ))}
    </SectionCard>
  )
}

// PackagesMap draws the packages map from the index's data. Clicking a
// package opens its page. hasDecks picks whether nodes size by builds or by
// card count.
export function PackagesMap({ data, cube, hasDecks }) {
  const [hovered, setHovered] = useState(null)
  const navigate = useNavigate()
  const nodes = useMemo(() => mapNodes(data.packages, hasDecks), [data.packages, hasDecks])
  const edges = useMemo(() => edgeList(data.edges), [data.edges])
  const byName = useMemo(() => new Map(data.packages.map(p => [p.name, p])), [data.packages])

  if (data.packages.length === 0) {
    return <SectionCard title="Packages"><div className="browse-empty">No packages in the rules yet.</div></SectionCard>
  }

  // onSelect opens the clicked package's page.
  function onSelect(id) {
    if (id) {
      navigate(packagePageHref(cube, id))
    }
  }

  return (
    <div className="packages-map-layout">
      <SectionCard title="Packages">
        <div className="packages-map">
          <MapView
            nodes={nodes}
            edges={edges}
            nodeColor={nodeColor}
            hoveredId={hovered}
            onHover={setHovered}
            onSelect={onSelect}
            renderHover={id => <PackageHover stat={byName.get(id)} edges={data.edges} hasDecks={hasDecks} />}
          />
        </div>
      </SectionCard>
      <MostLinked cards={data.mostLinked} cube={cube} />
    </div>
  )
}
