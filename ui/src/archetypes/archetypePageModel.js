// The archetype page's numbers and lists, worked out from the server's
// answer. Kept free of React so node tests can load it.

// MACRO_NAMES are the three macro archetypes as the page titles them. Any
// other name is a tag.
const MACRO_NAMES = { aggro: "Aggro", midrange: "Midrange", control: "Control" }

// TOP_CARD_COLUMNS are the top cards table's columns. Each says what it
// counts in its tip, since the page avoids invented terms.
export const TOP_CARD_COLUMNS = [
  { id: "name", text: "Card", tip: "Cards its decks mainboarded." },
  { id: "decks", text: "Decks", tip: "Its decks that mainboarded the card." },
  { id: "in_share", text: "In % of its decks", tip: "Share of its decks that mainboarded the card." },
  { id: "of_card_decks", text: "% of the card's decks", tip: "Share of every deck that mainboarded the card that was one of its decks. Near 100% means the card rarely shows up anywhere else." },
  { id: "fit", text: "Fit", tip: "The two shares multiplied: high for a card its decks play often and other decks rarely do. The default order." },
]

// pageTitle is how the page names the archetype: macros capitalized, tags as
// the decks carry them.
export function pageTitle(name) {
  return MACRO_NAMES[name] || name
}

// pageSubtitle says whether the name is a macro archetype or a tag.
export function pageSubtitle(name) {
  if (MACRO_NAMES[name]) {
    return "Macro archetype"
  }
  return "Tag"
}

// archetypeMatch is the deck filter for decks that carry the archetype, as
// their macro archetype or as a tag.
export function archetypeMatch(name) {
  return `arch:"${name}"`
}

// percentOf is n as a whole percent of total, or 0 when total is 0.
export function percentOf(n, total) {
  if (total === 0) {
    return 0
  }
  return Math.round(100 * n / total)
}

// shownTopCards filters the top cards to those played in at least minDecks of
// its decks, leaving out lands when hideLands is set, then sorts them by the
// chosen column: names A to Z, numbers high to low, ties by fit.
export function shownTopCards(cards, { hideLands, minDecks, sortBy }) {
  const kept = []
  for (const card of cards) {
    if (hideLands && card.land) {
      continue
    }
    if (card.decks < minDecks) {
      continue
    }
    kept.push(card)
  }

  kept.sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name)
    }
    const column = sortBy || "fit"
    if (a[column] !== b[column]) {
      return b[column] - a[column]
    }
    return b.fit - a.fit
  })
  return kept
}
