// The Cards page's popularity filter and the Popularity column's tip. Kept
// free of React so node tests can load it.

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
