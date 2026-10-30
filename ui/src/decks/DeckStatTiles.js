import React from "react"
import { StatTile } from "../components/kit/StatTile.js"
import { deckCounts, opponentStrengthText } from "./deckModel.js"

// DeckStatTiles is the row of five numbers under the identity card, all for
// the deck's mainboard: card, creature, and interaction counts, average mana
// value, and how well its opponents did overall.
export function DeckStatTiles({ deck, copy }) {
  const counts = deckCounts(deck.mainboard || [])

  let avgManaValue = "–"
  if (deck.avg_cmc) {
    avgManaValue = deck.avg_cmc
  }

  return (
    <div className="deck-stat-tiles">
      <StatTile label={copy.cards} value={counts.cards} />
      <StatTile label={copy.creatures} value={counts.creatures} />
      <StatTile label={copy.interaction} value={counts.interaction} />
      <StatTile label={copy.avgManaValue} value={avgManaValue} />
      <StatTile label={copy.opponentWinPercent} value={opponentStrengthText(deck)} tip={copy.opponentStrengthTip} />
    </div>
  )
}
