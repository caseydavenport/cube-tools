// How each macro archetype's decks finished, as shares of its decks, for the
// Archetypes page's finishes chart. Kept free of React so node tests can load
// it.

// FINISHES are the chart's segments, best to worst. A trophy is a 3-0 deck
// and a last place a 0-3 deck; "winning" and "losing" here leave those out.
export const FINISHES = [
  { key: "trophy", label: "Trophy (3-0)" },
  { key: "winning", label: "Other winning record" },
  { key: "even", label: "Even record" },
  { key: "losing", label: "Other losing record" },
  { key: "last", label: "Last place (0-3)" },
]

// MACROS are the archetypes the chart compares, in display order.
const MACROS = ["aggro", "midrange", "control"]

// finishCounts splits an archetype row's decks into the FINISHES. The row's
// winning count includes its trophies, and its losing count its last places.
function finishCounts(row) {
  return {
    trophy: row.trophies,
    winning: row.winning - row.trophies,
    even: row.count - row.winning - row.losing,
    losing: row.losing - row.last_place,
    last: row.last_place,
  }
}

// finishRows returns one row per macro archetype with decks: its name, its
// deck count, and each finish's count and percent of its decks.
export function finishRows(archetypeData) {
  const rows = []
  for (const type of MACROS) {
    const row = archetypeData.get(type)
    if (!row || row.count === 0) {
      continue
    }

    const counts = finishCounts(row)
    const shares = {}
    for (const finish of FINISHES) {
      shares[finish.key] = 100 * counts[finish.key] / row.count
    }
    rows.push({ type, decks: row.count, counts, shares })
  }
  return rows
}
