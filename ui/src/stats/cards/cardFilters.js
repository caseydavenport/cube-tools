// The Cards page's popularity filter, the Popularity column's tip, and the
// archetype mix shares. Kept free of React so node tests can load it.

// POPULARITY_OPTIONS are the popularity filter's choices. The values are the
// server's popularity words, the same ones the card page shows.
export const POPULARITY_OPTIONS = [
  { label: "Any", value: "" },
  { label: "Popular", value: "popular" },
  { label: "Typical", value: "typical" },
  { label: "Niche", value: "niche" },
]

// POPULARITY_TIP explains the Popularity column: the rate it shows and what
// the popularity words mean.
export const POPULARITY_TIP = "Share of the drafts where a deck took the card that it made the main deck. Only decks with their sideboard recorded count, so a card nobody opened, or one whose deck's sideboard is missing, counts neither for nor against it. Popular means a higher rate than two thirds of the same-color cube cards, niche lower than two thirds. Hover a value for its counts."

// matchesPopularity reports whether a card passes the popularity filter.
// An empty choice passes every card.
export function matchesPopularity(card, choice) {
  if (!choice) {
    return true
  }
  return card.popularity === choice
}

// popularityLabel is a popularity word with a capital letter, or "" for none.
export function popularityLabel(popularity) {
  if (!popularity) {
    return ""
  }
  return popularity[0].toUpperCase() + popularity.slice(1)
}

// MACROS are the macro archetypes the archetype mix splits a card's decks by.
export const MACROS = ["aggro", "midrange", "control"]

// macroDecks is how many of the card's decks carried a macro archetype.
export function macroDecks(card) {
  let total = 0
  for (const macro of MACROS) {
    total += (card.num_decks_by_macro || {})[macro] || 0
  }
  return total
}

// macroShare is the percent of the card's decks with a macro archetype that
// were the given one, or NaN when none of its decks had one, so the card
// sinks when the column is sorted.
export function macroShare(card, macro) {
  const total = macroDecks(card)
  if (total === 0) {
    return NaN
  }
  const count = (card.num_decks_by_macro || {})[macro] || 0
  return 100 * count / total
}
