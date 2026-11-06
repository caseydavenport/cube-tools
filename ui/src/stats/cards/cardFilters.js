// The Cards page's popularity filter and the "expected by chance" count
// beside "Significant only". Kept free of React so node tests can load it.

// POPULARITY_OPTIONS are the popularity filter's choices. The values are the
// server's popularity words, the same ones the card page shows.
export const POPULARITY_OPTIONS = [
  { label: "Any", value: "" },
  { label: "Popular", value: "popular" },
  { label: "Typical", value: "typical" },
  { label: "Niche", value: "niche" },
]

// POPULARITY_TIP explains what the popularity words mean.
export const POPULARITY_TIP = "How often decks play the card, compared with the other cube cards of its color. Counted per draft the card was in: popular cards are played more than two thirds of them, niche cards less than a third. Cards in fewer than 5 drafts, or with fewer than 10 same-color cards to compare against, have none."

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

// expectedByChance is about how many of tested cards would pass "Significant
// only" by luck alone: a card with no real effect still gets an interval
// that misses 50% with probability 1 - confidence.
export function expectedByChance(tested, confidence) {
  const level = parseFloat(confidence)
  if (!(level > 0 && level < 1)) {
    return 0
  }
  return Math.round(tested * (1 - level))
}
