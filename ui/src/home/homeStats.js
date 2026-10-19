// Turns the server's stats responses into the headline numbers the cube home
// shows. Every function here is pure and returns null (or an empty list) when
// the response is missing or has nothing that qualifies, so the page can show
// an empty state instead of blank or NaN values.
import { colorName, WUBRG } from "../utils/colorNames.js"

// The three macro archetypes. The archetype stats also include free-form tags,
// which the best-archetype tile ignores.
const MACRO_ARCHETYPES = ["aggro", "midrange", "control"]

// highestBy returns the item with the largest value of score(item), or null for
// an empty list. On a tie, the earlier item wins.
function highestBy(items, score) {
  let best = null
  for (const item of items) {
    if (best === null || score(item) > score(best)) {
      best = item
    }
  }
  return best
}

// countSummary counts a cube's drafts, decks, and players. labelOf names the
// person behind a deck, so the caller decides how anonymous seats are counted.
export function countSummary(decks, labelOf) {
  const drafts = new Set()
  const players = new Set()

  for (const deck of decks) {
    drafts.add(deck.metadata.draft_id)
    players.add(labelOf(deck))
  }

  return { drafts: drafts.size, decks: decks.length, players: players.size }
}

// bestArchetype returns the macro archetype (aggro, midrange, or control) with
// the highest win rate among those that played at least one game.
export function bestArchetype(response) {
  if (!response || !response.archetypes) {
    return null
  }

  const played = []
  for (const name of MACRO_ARCHETYPES) {
    const stats = response.archetypes[name]
    if (stats && stats.count > 0 && stats.wins + stats.losses > 0) {
      played.push({ name, winPercent: stats.win_percent, buildPercent: stats.build_percent })
    }
  }

  return highestBy(played, a => a.winPercent)
}

// colorEntries returns the per-color-identity stats from a /stats/colors
// response, or an empty list when there is no response.
function colorEntries(response) {
  if (!response || !response.all || !response.all.data) {
    return []
  }
  return Object.values(response.all.data)
}

// bestColorPair returns the two-color pair with the highest win rate among
// pairs with at least minDecks decks, so a pair played twice can't top it.
export function bestColorPair(response, minDecks = 10) {
  const pairs = colorEntries(response).filter(c => c.color.length === 2 && c.num_decks >= minDecks)

  const best = highestBy(pairs, c => c.win_percent)
  if (best === null) {
    return null
  }
  return { identity: best.color, name: colorName(best.color), winPercent: best.win_percent, decks: best.num_decks }
}

// colorWinRates returns each single color's win rate in WUBRG order, leaving
// out colors no deck played.
export function colorWinRates(response) {
  const byColor = {}
  for (const entry of colorEntries(response)) {
    byColor[entry.color] = entry
  }

  const rates = []
  for (const color of WUBRG) {
    const entry = byColor[color]
    if (entry && entry.num_decks > 0) {
      rates.push({ color, winPercent: entry.win_percent, decks: entry.num_decks })
    }
  }
  return rates
}

// hottestCard returns the card whose win rate beats its expected win rate by the
// most. Expected is the same players' win rate without the card; cards with no
// expectation yet are skipped. delta is in whole percentage points.
export function hottestCard(response) {
  if (!response || !response.all || !response.all.data) {
    return null
  }

  const cards = Object.values(response.all.data).filter(c => c.expected_win_percent > 0)
  const best = highestBy(cards, c => c.win_percent - c.expected_win_percent)
  if (best === null) {
    return null
  }

  // A card only counts as "hot" when it actually beats its expected win rate.
  const delta = Math.round(best.win_percent - best.expected_win_percent)
  if (delta <= 0) {
    return null
  }
  return { name: best.name, delta, winPercent: best.win_percent }
}

// topPlayers returns the best players by win rate among those with at least
// minDecks decks, at most limit of them. Ties go to the player with more decks.
export function topPlayers(response, minDecks = 5, limit = 3) {
  if (!response || !response.players) {
    return []
  }

  const regulars = Object.values(response.players).filter(p => p.num_decks >= minDecks)

  regulars.sort((a, b) => {
    if (b.win_percent !== a.win_percent) {
      return b.win_percent - a.win_percent
    }
    return b.num_decks - a.num_decks
  })

  return regulars.slice(0, limit).map(p => ({
    id: p.id,
    name: p.name,
    decks: p.num_decks,
    winPercent: p.win_percent,
  }))
}
