// Lays a deck's cards out into the decklist's columns: one per mana value range,
// then a lands column. Within a column, cards are grouped under a heading (card
// type, or land role for lands). Pure functions, tested in decklist.test.mjs.
import { IsBasicLand } from "../utils/Utils.js"

// CMC_COLUMNS are the mana value columns, cheapest first.
export const CMC_COLUMNS = ["0-1", "2", "3", "4", "5+"]

// TYPE_PRIORITY orders the card types a card is filed under. A card's types mix
// supertypes (Legendary, Snow) with several types, so getType takes the first
// one from this list rather than types[0], which could be "Legendary".
const TYPE_PRIORITY = ["Creature", "Planeswalker", "Instant", "Sorcery", "Enchantment", "Artifact", "Basic", "Land"]

// LAND_ORDER is the heading order in the lands column.
export const LAND_ORDER = ["Basics", "Fetchables", "Fetches", "Other"]

// getType is the type heading a spell is filed under in its column.
export function getType(card) {
  const types = card.types || []
  for (const type of TYPE_PRIORITY) {
    if (types.includes(type)) {
      return type
    }
  }
  return types[0] || "Unknown"
}

// landCategory is the heading a land is filed under:
//   - Basics: basic lands.
//   - Fetches: lands that sacrifice themselves to search for a land.
//   - Fetchables: nonbasics with a basic land type, so a fetch can find them.
//     The tell is the reminder text "({T}: Add ...)", which only lands with a
//     basic land type print.
//   - Other: everything else (utility lands, manlands, and so on).
export function landCategory(card) {
  if (IsBasicLand(card)) {
    return "Basics"
  }

  const text = card.oracle_text || ""
  if (/Sacrifice this land: Search your library for/.test(text)) {
    return "Fetches"
  }
  if (/\(\{T\}: Add /.test(text)) {
    return "Fetchables"
  }
  return "Other"
}

// isLand reports whether a card goes in the lands column.
export function isLand(card) {
  if (IsBasicLand(card)) {
    return true
  }
  return (card.types || []).includes("Land")
}

// cmcColumn is the mana value column a spell goes in.
export function cmcColumn(card) {
  const cmc = card.cmc || 0
  if (cmc < 2) {
    return "0-1"
  }
  if (cmc < 3) {
    return "2"
  }
  if (cmc < 4) {
    return "3"
  }
  if (cmc < 5) {
    return "4"
  }
  return "5+"
}

// compareHeadings orders a column's headings: alphabetical for card types, and
// LAND_ORDER for land roles.
function compareHeadings(a, b, lands) {
  if (lands) {
    return LAND_ORDER.indexOf(a) - LAND_ORDER.indexOf(b)
  }
  return a.localeCompare(b)
}

// buildColumn groups one column's cards under their headings, sorted by
// heading and then by name, with duplicate cards collapsed into copies.
function buildColumn(key, label, cards, lands) {
  const headings = new Map()
  for (const card of cards) {
    let heading = getType(card)
    if (lands) {
      heading = landCategory(card)
    }

    if (!headings.has(heading)) {
      headings.set(heading, new Map())
    }
    const byName = headings.get(heading)
    if (byName.has(card.name)) {
      byName.get(card.name).copies += 1
    } else {
      byName.set(card.name, { card, copies: 1 })
    }
  }

  const types = [...headings.keys()].sort((a, b) => compareHeadings(a, b, lands))
  const groups = types.map(type => {
    const entries = [...headings.get(type).values()]
    entries.sort((a, b) => a.card.name.localeCompare(b.card.name))
    return { type, cards: entries }
  })

  return { key, label, count: cards.length, groups }
}

// decklistColumns splits cards into the decklist's columns, leaving out any that
// are empty. Each column has a key, a label, its card count, and its cards
// grouped under headings.
export function decklistColumns(cards) {
  const byColumn = new Map(CMC_COLUMNS.map(key => [key, []]))
  const lands = []

  for (const card of cards || []) {
    if (isLand(card)) {
      lands.push(card)
    } else {
      byColumn.get(cmcColumn(card)).push(card)
    }
  }

  const columns = []
  for (const key of CMC_COLUMNS) {
    const columnCards = byColumn.get(key)
    if (columnCards.length > 0) {
      columns.push(buildColumn(key, key, columnCards, false))
    }
  }
  if (lands.length > 0) {
    columns.push(buildColumn("lands", "Lands", lands, true))
  }
  return columns
}
