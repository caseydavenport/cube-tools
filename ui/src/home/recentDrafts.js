// Builds the cube home's "Recent drafts" list: each draft's date badge, name,
// player count, and winner. Pure functions, tested in recentDrafts.test.mjs.
import { isAnonymous } from "../utils/Players.js"

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

// dateBadge splits a "YYYY-MM-DD" date into the day and short month shown on a
// draft's badge. It reads the string directly rather than through a Date, so
// the viewer's time zone can't shift the day. Returns null for other formats.
export function dateBadge(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "")
  if (!match) {
    return null
  }

  const month = MONTHS[Number(match[2]) - 1]
  if (!month) {
    return null
  }
  return { day: String(Number(match[3])), month }
}

// recordText formats a deck's match record as "W-L", or "W-L-D" with draws.
function recordText(stats) {
  const record = `${stats.match_wins}-${stats.match_losses}`
  if (stats.match_draws > 0) {
    return `${record}-${stats.match_draws}`
  }
  return record
}

// compareRecords orders decks best first: more match wins, then fewer losses.
function compareRecords(a, b) {
  if (b.stats.match_wins !== a.stats.match_wins) {
    return b.stats.match_wins - a.stats.match_wins
  }
  return a.stats.match_losses - b.stats.match_losses
}

// bestByRecord returns the deck with the best match record, or null when no
// deck played a match or the top two decks have the same record.
function bestByRecord(decks) {
  const played = decks.filter(d => d.stats.match_wins + d.stats.match_losses + d.stats.match_draws > 0)
  if (played.length === 0) {
    return null
  }

  const sorted = [...played].sort(compareRecords)
  if (sorted.length > 1 && compareRecords(sorted[0], sorted[1]) === 0) {
    return null
  }
  return sorted[0]
}

// winnerFrom describes the winning deck for display. An anonymous seat has no
// player name, so it's reported by seat number instead of its "p6" label, which
// every draft reuses. playerId is set when the winner is in the player list, so
// pages can link to them.
function winnerFrom(deck, undefeated) {
  let player = deck.player
  let seat = null
  if (isAnonymous(deck)) {
    player = null
    seat = deck.seat || deck.id
  }
  return { player, seat, colors: deck.colors, record: recordText(deck.stats), undefeated, playerId: deck.player_id || null }
}

// draftWinner picks the deck that won a draft. A single undefeated (trophy) deck
// wins; otherwise the deck with the best match record does. A tie, or a draft
// with no results, has no winner. undefeated says which rule picked it.
export function draftWinner(decks) {
  const withStats = decks.filter(d => d.stats)

  const trophyDecks = withStats.filter(d => d.stats.trophies > 0)
  let winner
  if (trophyDecks.length === 1) {
    winner = trophyDecks[0]
  } else {
    winner = bestByRecord(withStats)
  }

  if (!winner) {
    return null
  }
  return winnerFrom(winner, trophyDecks.length === 1)
}

// draftName is how a draft is titled in the list: its event name with any
// flight in parentheses, or "Draft #<id>" when it has no name.
export function draftName(draft) {
  let name = draft.event_name || `Draft #${draft.id}`
  if (draft.flight) {
    name += ` (${draft.flight})`
  }
  return name
}

// compareNewestFirst orders drafts by date, newest first, then by id, highest
// first, so two drafts on the same day keep a stable order.
export function compareNewestFirst(a, b) {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1
  }
  return b.id - a.id
}

// deckCount is how many decks the index lists for a draft. The server sends
// null rather than an empty list for a draft with no decks.
export function deckCount(draft) {
  if (!draft.decks) {
    return 0
  }
  return draft.decks.length
}

// recentDrafts returns the cube's newest drafts, at most limit of them, ready to
// show: id, name, date badge, player count (one deck per player), and winner.
export function recentDrafts(index, decks, limit = 5) {
  if (!index || !index.drafts) {
    return []
  }

  const newest = [...index.drafts].sort(compareNewestFirst).slice(0, limit)

  return newest.map(draft => {
    const draftDecks = decks.filter(d => d.metadata.draft_id === draft.id)
    return {
      id: draft.id,
      name: draftName(draft),
      badge: dateBadge(draft.date),
      players: deckCount(draft),
      winner: draftWinner(draftDecks),
    }
  })
}
