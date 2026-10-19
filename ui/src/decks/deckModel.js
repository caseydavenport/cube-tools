// The Decks page's logic, kept apart from its components: how decks are
// identified, sorted, grouped, and summarized, and how a deck's matches, themes,
// and copyable list are worked out. Pure functions, tested in deckModel.test.mjs.
import { Losses, MatchDraws, MatchLosses, MatchRecord, MatchWins, Record, Wins } from "../utils/Deck.js"
import { compareDrafts } from "../utils/DraftInfo.js"
import { dateBadge } from "../home/recentDrafts.js"

// deckRef is the opaque selection token for a deck: its draft plus its id.
// It's unique across drafts; never split the id back out of it.
export function deckRef(deck) {
  return `${deck.metadata.draft_id}/${deck.id}`
}

const ARCHETYPE_LABELS = { aggro: "Aggro", midrange: "Midrange", control: "Control" }

// archetypeLabel is the display name of a deck's archetype (aggro, midrange, or
// control), or null when it has none.
export function archetypeLabel(deck) {
  const key = (deck.macro_archetype || "").toLowerCase()
  return ARCHETYPE_LABELS[key] || null
}

// gameWinRate is the fraction of games a deck won, or 0 with no games.
function gameWinRate(deck) {
  const games = Wins(deck) + Losses(deck)
  if (games === 0) {
    return 0
  }
  return Wins(deck) / games
}

// recordSortValue ranks decks for the record sort: match wins first, then game
// win rate as a tiebreak. Decks that played matches come above those that only
// have games, and decks with no results at all go last.
function recordSortValue(deck) {
  const playedMatches = MatchWins(deck) > 0 || MatchLosses(deck) > 0
  const playedGames = Wins(deck) > 0 || Losses(deck) > 0
  if (!playedMatches && !playedGames) {
    return -1
  }

  let value = MatchWins(deck) + gameWinRate(deck)
  if (playedMatches) {
    value += 100
  }
  return value
}

// compareText orders two strings alphabetically, ignoring case.
function compareText(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

// compareArchetypes orders decks by archetype name, with decks that have no
// archetype last.
function compareArchetypes(a, b) {
  const labelA = archetypeLabel(a)
  const labelB = archetypeLabel(b)
  if (labelA === labelB) {
    return 0
  }
  if (labelA === null) {
    return 1
  }
  if (labelB === null) {
    return -1
  }
  return compareText(labelA, labelB)
}

// sortDecks returns a sorted copy of decks. The key is "date" (newest draft
// first), "player" (A to Z), "record" (best first), or "archetype" (A to Z).
export function sortDecks(decks, key) {
  const sorted = [...decks]

  if (key === "player") {
    sorted.sort((a, b) => compareText(a.player || "", b.player || ""))
  } else if (key === "record") {
    sorted.sort((a, b) => recordSortValue(b) - recordSortValue(a))
  } else if (key === "archetype") {
    sorted.sort(compareArchetypes)
  } else {
    sorted.sort((a, b) => compareDrafts(b.draft, a.draft))
  }
  return sorted
}

// draftHeader is the label over a draft's decks in the list, such as
// "GOODBYE SF · JUL 26". A flight is named too, so two flights on the same day
// can be told apart.
function draftHeader(deck) {
  const draft = deck.draft || {}
  let name = draft.event_name || `Draft #${deck.metadata.draft_id}`
  if (draft.flight) {
    name += ` (${draft.flight})`
  }
  name = name.toUpperCase()

  const badge = dateBadge(draft.date || deck.date)
  if (!badge) {
    return name
  }
  return `${name} · ${badge.month} ${badge.day}`
}

// groupByDraft splits an already sorted deck list into runs of decks from the
// same draft, each with a header label, keeping the given order.
export function groupByDraft(sortedDecks) {
  const groups = []
  for (const deck of sortedDecks) {
    const draftId = deck.metadata.draft_id
    const last = groups[groups.length - 1]
    if (last && last.draft === draftId) {
      last.decks.push(deck)
    } else {
      groups.push({ draft: draftId, label: draftHeader(deck), decks: [deck] })
    }
  }
  return groups
}

// listSummary totals the match record of every deck in the list, plus the
// overall game win percentage, for the line above the list.
export function listSummary(decks) {
  let wins = 0
  let losses = 0
  let draws = 0
  let gameWins = 0
  let gameLosses = 0

  for (const deck of decks) {
    wins += MatchWins(deck)
    losses += MatchLosses(deck)
    draws += MatchDraws(deck)
    gameWins += Wins(deck)
    gameLosses += Losses(deck)
  }

  let winPercent = 0
  if (gameWins + gameLosses > 0) {
    winPercent = Math.round(100 * gameWins / (gameWins + gameLosses))
  }
  return { count: decks.length, wins, losses, draws, winPercent }
}

// resolveSelectedDeck finds the deck a ?deck= ref names. The status is "none"
// when nothing is selected, "found" with the deck, or "missing" when the ref
// names a deck the current list doesn't hold (filtered out, or a stale link).
export function resolveSelectedDeck(decks, ref) {
  if (!ref) {
    return { status: "none" }
  }

  const deck = decks.find(d => deckRef(d) === ref)
  if (!deck) {
    return { status: "missing" }
  }
  return { status: "found", deck }
}

// findOpponent looks up a match's opponent deck in the same draft: by the
// match's opponent_id when it has one, otherwise by player name, which older
// records rely on.
function findOpponent(deck, match, decks) {
  const draftId = deck.metadata.draft_id
  const sameDraft = decks.filter(d => d.metadata.draft_id === draftId)

  if (match.opponent_id) {
    return sameDraft.find(d => d.id === match.opponent_id)
  }
  if (match.opponent) {
    const name = match.opponent.toLowerCase()
    return sameDraft.find(d => (d.player || "").toLowerCase() === name)
  }
  return undefined
}

// matchResult says whether the deck won ("W"), lost ("L"), or drew ("D") a
// match. A recorded winner decides it; otherwise the game count does.
function matchResult(deck, match) {
  if (match.wins === match.losses) {
    return "D"
  }
  if (match.winner) {
    if (match.winner.toLowerCase() === (deck.player || "").toLowerCase()) {
      return "W"
    }
    return "L"
  }
  if (match.losses > match.wins) {
    return "L"
  }
  return "W"
}

// matchScore is the match's game score, like "2-1". Older records with no
// per-match counts fall back to adding up the deck's games against that
// opponent.
function matchScore(deck, match) {
  if (match.wins === 0 && match.losses === 0 && match.draws === 0) {
    return Record(deck, match.opponent || "")
  }
  return MatchRecord(match)
}

// roundOrder sorts matches by round, with matches missing a round last.
function roundOrder(match) {
  return match.round || Infinity
}

// matchRows describes each of a deck's matches for the Matches card, in round
// order: the opponent, a ref to their deck when it's in decks, their archetype,
// the result, and the game score.
export function matchRows(deck, decks) {
  const matches = [...(deck.matches || [])].sort((a, b) => roundOrder(a) - roundOrder(b))

  return matches.map(match => {
    const opponentDeck = findOpponent(deck, match, decks)
    let opponentRef = null
    let opponentArchetype = null
    if (opponentDeck) {
      opponentRef = deckRef(opponentDeck)
      opponentArchetype = archetypeLabel(opponentDeck)
    }

    return {
      round: match.round || null,
      opponent: match.opponent || null,
      opponentRef,
      opponentArchetype,
      result: matchResult(deck, match),
      score: matchScore(deck, match),
    }
  })
}

// compareLeanings orders leansInto's groups by how many decks they beat, most
// first, and then by how many of their cards the deck runs.
function compareLeanings(a, b) {
  if (a.below !== b.below) {
    return b.below - a.below
  }
  return b.count - a.count
}

// leansInto ranks the design-map groups a deck leans into: for each group, the
// fraction of decks in the cube that run fewer of its cards than this one does.
// A group needs at least 3 cards here and to beat 60% of decks to count, and
// manabase groups are skipped. topPercent is the share of decks it ties or
// trails, so "top 6%" reads as "more than 94% of decks".
export function leansInto(groupDistributions, cards, limit = 5) {
  if (!groupDistributions || !groupDistributions.deck_count) {
    return []
  }

  const names = new Set((cards || []).map(c => c.name))
  const ranked = []

  for (const group of groupDistributions.groups || []) {
    if (group.manabase) {
      continue
    }

    const count = (group.cards || []).filter(name => names.has(name)).length
    if (count < 3) {
      continue
    }

    const fewer = (group.deck_counts || []).filter(n => n < count).length
    const below = fewer / groupDistributions.deck_count
    if (below < 0.6) {
      continue
    }

    ranked.push({ name: group.name, count, below })
  }

  ranked.sort(compareLeanings)

  return ranked.slice(0, limit).map(group => ({
    name: group.name,
    count: group.count,
    topPercent: Math.max(1, Math.round((1 - group.below) * 100)),
  }))
}

// copyListText is a deck list in the "2x Card Name" form other tools import,
// one line per card name in the order the cards first appear.
export function copyListText(cards) {
  const counts = new Map()
  for (const card of cards || []) {
    counts.set(card.name, (counts.get(card.name) || 0) + 1)
  }

  let text = ""
  for (const [name, count] of counts) {
    text += `${count}x ${name}\n`
  }
  return text
}

// boardCards returns the cards on one of a deck's boards ("Mainboard",
// "Sideboard", or "Pool"), or an empty list when the deck doesn't have it.
export function boardCards(deck, board) {
  let cards = deck.mainboard
  if (board === "Sideboard") {
    cards = deck.sideboard
  } else if (board === "Pool") {
    cards = deck.pool
  }
  return cards || []
}

// deckCounts counts a list's cards, creatures, and interaction (removal and
// counterspells), for the stat tiles. A card counts as interaction when its
// rules text contains any of the given phrases.
export function deckCounts(cards, interactionPhrases) {
  let creatures = 0
  let interaction = 0

  for (const card of cards) {
    if ((card.types || []).includes("Creature")) {
      creatures += 1
    }

    const text = (card.oracle_text || "").toLowerCase()
    if (interactionPhrases.some(phrase => text.match(phrase))) {
      interaction += 1
    }
  }
  return { cards: cards.length, creatures, interaction }
}
