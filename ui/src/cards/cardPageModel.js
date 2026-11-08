// The card page's text helpers: the words and numbers its header and sections
// show, kept apart from the components so they can be tested.

import { ruleColor } from "../design/map/ruleColors.js"
import { isNewCard } from "./newCard.js"
import { confidencePercent, winRateMuted, winRateRows, winRateText } from "../components/kit/winRate.js"

// PEER_NAMES names each color group a card's popularity is compared within.
export const PEER_NAMES = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
  M: "multicolor",
  C: "colorless",
}

// STATE_WORDS describe each draft state on the cube history strip.
const STATE_WORDS = {
  played: "played",
  in: "in the cube",
  out: "not in the cube",
  unknown: "no cube list",
}

// playedTile is the "Times played" tile's value and detail: "18 of 27" and
// "67% of the times a deck took it". It counts copies, so a card the cube runs
// twice is judged by both. The detail is blank when no deck recording its
// choices took the card.
export function playedTile(play) {
  const value = `${play.times_played} of ${play.times_taken}`
  if (play.times_taken === 0) {
    return { value, detail: "" }
  }
  return { value, detail: `${Math.round(play.rate)}% of the times a deck took it` }
}

// popularityLabel turns the server's popularity word into the tile's label.
export function popularityLabel(popularity) {
  if (!popularity) {
    return ""
  }
  return popularity[0].toUpperCase() + popularity.slice(1)
}

// popularityTip explains the popularity label: how often the card was played
// when a deck took it, and the median for its color group. Blank when there's
// no label.
export function popularityTip(play) {
  if (!play.popularity) {
    return ""
  }
  const peers = PEER_NAMES[play.peers] || play.peers
  return `Played ${play.rate}% of the times a deck took it. The median ${peers} card: ${play.peer_median}%.`
}

// historyTitle is one history square's tip: its draft, date and state.
export function historyTitle(cell) {
  return `Draft ${cell.draft_id}, ${cell.date}: ${STATE_WORDS[cell.state] || cell.state}`
}

// cardSubtitle is the line under the card's name: its mana cost and types.
export function cardSubtitle(card) {
  const types = (card.types || []).join(" ")
  if (!card.mana_cost) {
    return types
  }
  return `${card.mana_cost} · ${types}`
}

// CARD_REF_PREFIX marks a wire entry that names one card instead of a group.
const CARD_REF_PREFIX = "card:"

// bothCardsMatch is the deck filter for decks that mainboarded both cards.
export function bothCardsMatch(a, b) {
  return `card:"${a}" card:"${b}"`
}

// loomChip is one end of a compare link: a group, or a card: entry shown as
// the card's name, colored like the first package that reaches it.
function loomChip(entry, color) {
  let label = entry
  if (entry.startsWith(CARD_REF_PREFIX)) {
    label = entry.slice(CARD_REF_PREFIX.length)
  }
  return { key: entry, label, color }
}

// compareLoom turns the compare endpoint's links into Loom input: the first
// card's groups on the left, the second's on the right, and one thread per
// link, colored by its package and labeled with the package's name.
// packageIndex maps each package to its color index.
export function compareLoom(links, packageIndex) {
  const left = []
  const right = []
  const threads = []
  const seenLeft = new Set()
  const seenRight = new Set()
  for (const link of links) {
    const color = ruleColor(packageIndex[link.package] ?? 0)
    if (!seenLeft.has(link.group)) {
      seenLeft.add(link.group)
      left.push(loomChip(link.group, color))
    }
    if (!seenRight.has(link.other_group)) {
      seenRight.add(link.other_group)
      right.push(loomChip(link.other_group, color))
    }
    threads.push({
      key: `${link.package}:${link.group}>${link.other_group}`,
      from: link.group,
      to: link.other_group,
      color,
      label: link.package,
    })
  }
  return { left, right, threads }
}

// partnerMapData builds the partner map's nodes and edges: the card in the
// middle and each partner once, joined by an edge colored by the first
// package that links them. Nodes carry their colors for the map to paint.
export function partnerMapData(card, partners, packageIndex) {
  const nodes = [{ id: card.name, label: card.name, radius: 10, colors: card.colors || [] }]
  const edges = []
  const seen = new Set([card.name])
  for (const group of partners) {
    for (const partner of group.cards) {
      if (seen.has(partner.name)) {
        continue
      }
      seen.add(partner.name)
      nodes.push({ id: partner.name, label: partner.name, radius: 5, colors: partner.colors || [] })
      edges.push({ source: card.name, target: partner.name, weight: 1, color: ruleColor(packageIndex[group.package] ?? 0) })
    }
  }
  return { nodes, edges }
}

// packageIndexOf maps each package name to its position, the index its color
// is picked by.
export function packageIndexOf(packageNames) {
  const index = {}
  packageNames.forEach((name, i) => {
    index[name] = i
  })
  return index
}

// whoPlaysMatch is the deck filter for decks that mainboarded the card and
// share one trait: kind is "colors", "archetype" or "player".
export function whoPlaysMatch(card, kind, value) {
  const cardTerm = `card:"${card}"`
  if (kind === "colors") {
    return `${cardTerm} dcolor=${value}`
  }
  if (kind === "archetype") {
    return `${cardTerm} arch:${value}`
  }
  return `${cardTerm} player:"${value}"`
}

// pickLine describes one logged pick of the card.
export function pickLine(pick) {
  return `${pick.date} · ${pick.player} · pack ${pick.pack}, pick ${pick.pick}`
}

// deckRecord is a deck's match record, "2-1", with draws only when it has any.
export function deckRecord(deck) {
  if (deck.draws > 0) {
    return `${deck.wins}-${deck.losses}-${deck.draws}`
  }
  return `${deck.wins}-${deck.losses}`
}

// knownDrafts counts the drafts on a card's history that have a cube list,
// and how many of those had the card in the cube.
function knownDrafts(history) {
  let known = 0
  let inCube = 0
  for (const cell of history) {
    if (cell.state === "unknown") {
      continue
    }
    known++
    if (cell.state === "played" || cell.state === "in") {
      inCube++
    }
  }
  return { known, inCube }
}

// draftsTile is the "Drafts in the cube" tile: drafts with the card out of
// those with a cube list, noting the drafts without one. It's null when no
// draft has a cube list, since then there's nothing to count.
export function draftsTile(history) {
  const { known, inCube } = knownDrafts(history)
  if (known === 0) {
    return null
  }
  const unknown = history.length - known
  let detail = ""
  if (unknown === 1) {
    detail = "1 draft has no cube list"
  } else if (unknown > 1) {
    detail = `${unknown} drafts have no cube list`
  }
  return { value: `${inCube} of ${known}`, detail }
}

// notInCubeTag is the header tag for a card the cube doesn't have now:
// "Cut from the cube" when any draft had it, else "Not in the cube".
export function notInCubeTag(history) {
  const wasIn = history.some(h => h.state === "played" || h.state === "in")
  if (wasIn) {
    return "Cut from the cube"
  }
  return "Not in the cube"
}

// isNewToCube reports whether the cube lists show the card in fewer than
// NEW_CARD_DRAFTS drafts. Without any cube lists there's no telling.
export function isNewToCube(history) {
  const { known, inCube } = knownDrafts(history)
  return known > 0 && isNewCard(inCube)
}

// gamesWonTile is the header's "Games won" tile for a record: the Bayes win %,
// muted when it can't be told apart from a coin flip, with the raw rate,
// interval and record in the tip. decks says whose games the tip counts. It's
// null with no games.
export function gamesWonTile(record, decks = "the decks that mainboarded it") {
  const rows = winRateRows(record, confidencePercent())
  if (rows.length === 0) {
    return null
  }
  const details = rows.map(row => `${row.label}: ${row.value}`).join(" · ")
  return {
    value: winRateText(record),
    muted: winRateMuted(record),
    tip: `Bayes win % of ${decks}. ${details}`,
  }
}

// connectionText says how much a cube card holds two packages together: the
// only card they share, or one of the cards they share counting this one.
export function connectionText(connection) {
  const pair = `${connection.a} and ${connection.b}`
  if (connection.shared === 0) {
    return `Only card shared by ${pair}`
  }
  return `One of ${connection.shared + 1} cards shared by ${pair}`
}
