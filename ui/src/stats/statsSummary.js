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
