import { personLabel } from "../utils/Players.js"

// statsSummary counts what the stats pages are showing: the drafts, decks, and
// players behind the current date range and deck filter. A player counts once
// however many drafts they played.
export function statsSummary(decks) {
  const drafts = new Set()
  const players = new Set()

  for (const deck of decks) {
    drafts.add(deck.metadata.draft_id)
    players.add(personLabel(deck))
  }

  return { drafts: drafts.size, decks: decks.length, players: players.size }
}

// DECK_FILTERED_VIEWS are the stats pages built from the filtered decks. Health
// and the Synergy map come from the server and ignore the deck filter.
const DECK_FILTERED_VIEWS = ["cards", "colors", "types", "deckstats", "synergy"]

// noDecksMatch reports whether a stats page should say no decks match: it's a
// page built from the decks, they've loaded, and the date range and filters
// leave none.
export function noDecksMatch(view, decksLoaded, decks) {
  if (!DECK_FILTERED_VIEWS.includes(view)) {
    return false
  }
  return decksLoaded && decks.length === 0
}
