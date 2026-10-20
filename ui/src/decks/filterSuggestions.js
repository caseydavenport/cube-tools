// The deck filter's autocomplete lists, built from a page's loaded decks.
// Shared by every page with a deck filter, and free of React so node tests
// can load it.

import { isAnonymous } from "../utils/Players.js"

// filterSuggestions lists the player names, archetypes and tags, and event codes
// in the loaded decks, for the deck filter's autocomplete.
export function filterSuggestions(decks) {
  const players = new Set()
  const archetypes = new Set()
  const eventCodes = new Set()

  for (const deck of decks) {
    if (deck.player && !isAnonymous(deck)) {
      players.add(deck.player)
    }
    if (deck.macro_archetype) {
      archetypes.add(deck.macro_archetype)
    }
    for (const label of deck.labels || []) {
      archetypes.add(label)
    }
    if (deck.draft && deck.draft.event_code) {
      eventCodes.add(deck.draft.event_code)
    }
  }

  return {
    playerNames: [...players].sort(),
    archetypes: [...archetypes].sort(),
    eventCodes: [...eventCodes].sort(),
  }
}
