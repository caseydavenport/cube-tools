import React, { useMemo } from "react"
import { IsBasicLand } from "../utils/Utils.js"
import { CardSynergyMap } from "../design/map/CardSynergyMap.js"

// MapDecklist shows a board as a force graph of its cards, linked by the cube's
// design rules. Basic lands aren't in the design graph, so they're left off.
// The filtered list is memoized: a new array would rebuild the map's layout.
// focus, when set, is the cards a hovered pill lights up.
export function MapDecklist({ cards, designGraph, focus }) {
  const mapCards = useMemo(() => cards.filter(card => !IsBasicLand(card)), [cards])
  return <CardSynergyMap cards={mapCards} edges={designGraph.edges || []} packages={designGraph.packages || []} focus={focus} />
}
