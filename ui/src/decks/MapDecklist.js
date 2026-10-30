import React, { useMemo } from "react"
import { IsBasicLand } from "../utils/Utils.js"
import { CardSynergyMap } from "../design/map/CardSynergyMap.js"

// MapDecklist shows a board as a force graph of its cards, linked by the cube's
// design rules. Basic lands aren't in the design graph, so they're left off.
// The filtered list is memoized: a new array would rebuild the map's layout.
export function MapDecklist({ cards, designGraph }) {
  const mapCards = useMemo(() => cards.filter(card => !IsBasicLand(card)), [cards])
  return <CardSynergyMap cards={mapCards} edges={designGraph.edges || []} packages={designGraph.packages || []} />
}
