// The card page's partner map: the card in the middle and its rule-linked
// partners around it. Clicking a partner opens its own page.

import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { SectionCard } from "../components/kit/SectionCard.js"
import { MapView } from "../components/map/MapView.js"
import { getNodeColor } from "../components/map/nodeColors.js"
import { CardPreview } from "../design/map/CardPreview.js"
import { cardPageHref } from "../shell/paths.js"
import { CardImageURL } from "../utils/Utils.js"
import { partnerMapData } from "./cardPageModel.js"

// nodeColor paints a node by its mana colors.
function nodeColor(node) {
  return getNodeColor(node.colors)
}

// PartnerMap draws the map for the page's card. Hovering a node previews the
// card; clicking a partner goes to its page.
export function PartnerMap({ page, packageIndex, cube }) {
  const [hovered, setHovered] = useState(null)
  const navigate = useNavigate()
  const data = useMemo(
    () => partnerMapData(page.card, page.partners, packageIndex),
    [page.card, page.partners, packageIndex],
  )

  if (data.nodes.length < 2) {
    return null
  }

  // onSelect opens a partner's page. Clicking the card itself does nothing.
  function onSelect(id) {
    if (id && id !== page.card.name) {
      navigate(cardPageHref(cube, id))
    }
  }

  return (
    <SectionCard title="Partner map">
      <div className="card-partner-map">
        <MapView
          nodes={data.nodes}
          edges={data.edges}
          nodeColor={nodeColor}
          hoveredId={hovered}
          selectedId={page.card.name}
          onHover={setHovered}
          onSelect={onSelect}
          renderHover={id => <CardPreview card={{ name: id, image: CardImageURL({ name: id }) }} inline />}
        />
      </div>
    </SectionCard>
  )
}
