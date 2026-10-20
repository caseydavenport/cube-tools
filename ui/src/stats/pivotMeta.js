// The lists the Charts page offers in its player chips and predicate
// dropdowns, built from the date range's decks. Free of React so node tests
// can load it.

import { isAnonymous } from "../utils/Players.js"

// byCountThenName sorts players with the most decks first, so heavy players
// are easy to find and uncheck, then alphabetically.
function byCountThenName(a, b) {
  if (a.count !== b.count) {
    return b.count - a.count
  }
  return a.name.localeCompare(b.name)
}

// pivotMeta returns { archetypes, players, labels, playerFreq } for decks.
// playerFreq is [{ name, count }] ranked by deck count, and players is the
// same names sorted alphabetically. Anonymous seats are left out, since every
// draft reuses their labels.
export function pivotMeta(decks) {
  const archetypes = new Set()
  const labels = new Set()
  const playerCounts = {}

  for (const deck of decks) {
    if (deck.macro_archetype) {
      archetypes.add(deck.macro_archetype)
    }
    if (deck.player && !isAnonymous(deck)) {
      playerCounts[deck.player] = (playerCounts[deck.player] || 0) + 1
    }
    for (const label of deck.labels || []) {
      labels.add(label)
    }
  }

  const playerFreq = Object.entries(playerCounts)
    .map(([name, count]) => ({ name, count }))
    .sort(byCountThenName)

  return {
    archetypes: [...archetypes].sort(),
    players: playerFreq.map(p => p.name).sort(),
    labels: [...labels].sort(),
    playerFreq,
  }
}
