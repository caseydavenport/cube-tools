// How a group's decks finished, as shares of its decks, for the finishes
// charts on the Archetypes and Colors pages. Kept free of React so node tests
// can load it.

// FINISHES are the chart's segments, best to worst. A trophy is a 3-0 deck
// and a last place a 0-3 deck; "winning" and "losing" here leave those out.
export const FINISHES = [
  { key: "trophy", label: "Trophy (3-0)" },
  { key: "winning", label: "Other winning record" },
  { key: "even", label: "Even record" },
  { key: "losing", label: "Other losing record" },
  { key: "last", label: "Last place (0-3)" },
]

// MACROS are the archetypes the Archetypes chart compares, in display order.
const MACROS = ["aggro", "midrange", "control"]

// finishRow builds one chart row from a group's totals: decks, trophies,
// winning records (counting trophies), losing records (counting last places)
// and last places. It holds each finish's count and percent of the decks.
export function finishRow(label, totals) {
  const counts = {
    trophy: totals.trophies,
    winning: totals.winning - totals.trophies,
    even: totals.decks - totals.winning - totals.losing,
    losing: totals.losing - totals.lastPlace,
    last: totals.lastPlace,
  }
  const shares = {}
  for (const finish of FINISHES) {
    shares[finish.key] = 100 * counts[finish.key] / totals.decks
  }
  return { label, decks: totals.decks, counts, shares }
}

// capitalize turns "aggro" into "Aggro" for a row label.
function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1)
}

// archetypeFinishRows returns one row per macro archetype with decks, from the
// archetypes endpoint's rows keyed by archetype.
export function archetypeFinishRows(archetypeData) {
  const rows = []
  for (const type of MACROS) {
    const row = archetypeData.get(type)
    if (!row || row.count === 0) {
      continue
    }
    rows.push(finishRow(capitalize(type), {
      decks: row.count,
      trophies: row.trophies,
      winning: row.winning,
      losing: row.losing,
      lastPlace: row.last_place,
    }))
  }
  return rows
}
