import React from "react"
import { IsBasicLand } from "../utils/Utils.js"
import { CardSynergyMap } from "../design/map/CardSynergyMap.js"

// MapDecklist shows a board as a force graph of its cards, linked by the cube's
// design rules. Basic lands aren't in the design graph, so they're left off.
export function MapDecklist({ cards, designGraph }) {
  const mapCards = cards.filter(card => !IsBasicLand(card))
  return <CardSynergyMap cards={mapCards} edges={designGraph.edges || []} links={designGraph.links || []} />
}
