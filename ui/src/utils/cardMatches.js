// DeckSplits sorts a deck's mainboard into creatures and interaction for the
// deck scatter plot.
import { isInteraction } from "./cardRoles.js"

// DeckSplits returns [creatures, interaction] for the deck's mainboard, where
// interaction is removal, counterspells and hand disruption.
export function DeckSplits(deck) {
  let creatures = 0
  let interaction = 0

  for (let card of deck.mainboard) {
    if (card.types.includes("Creature")) {
      creatures += 1
    }

    if (isInteraction(card)) {
      interaction += 1
    }
  }

  return [creatures, interaction]
}
