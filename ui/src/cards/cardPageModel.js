// The card page's text helpers: the words and numbers its header and sections
// show, kept apart from the components so they can be tested.

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

// playedTile is the "Decks that played it" tile's value and detail: "20 of
// 314" and "6% of decks that could". The detail is blank when no deck could.
export function playedTile(play) {
  const value = `${play.mainboard} of ${play.available}`
  if (play.available === 0) {
    return { value, detail: "" }
  }
  return { value, detail: `${Math.round(play.rate)}% of decks that could` }
}

// popularityLabel turns the server's popularity word into the tile's label.
export function popularityLabel(popularity) {
  if (!popularity) {
    return ""
  }
  return popularity[0].toUpperCase() + popularity.slice(1)
}

// popularityTip explains the popularity label: the card's mainboard rate and
// the median for its color group. Blank when there's no label.
export function popularityTip(play) {
  if (!play.popularity) {
    return ""
  }
  const peers = PEER_NAMES[play.peers] || play.peers
  return `Mainboarded in ${play.rate}% of the decks that could have. The median ${peers} card: ${play.peer_median}%.`
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
