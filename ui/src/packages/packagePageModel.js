// Pure helpers for the package page, kept free of React so node tests can
// load them: the header's text and tiles, color cells, and the chart's data.

import { cameTogetherText } from "./packagesModel.js"

// plural is "1 group" or "4 groups".
function plural(count, one, many) {
  if (count === 1) {
    return `1 ${one}`
  }
  return `${count} ${many}`
}

// packageSubtitle is the header's line under the name: how many distinct
// groups the package's wires use, and how many cube cards they hold.
export function packageSubtitle(page) {
  const groups = new Set()
  for (const wire of page.wires) {
    for (const group of [...wire.sources, ...wire.targets]) {
      groups.add(group.name)
    }
  }
  return `${plural(groups.size, "group", "groups")} · ${plural(page.stat.cardCount, "card", "cards")}`
}

// headerTiles are the header's three play numbers, with their tips. The
// Games won tile is added by the header, since it needs the cube's info.
export function headerTiles(stat) {
  return [
    {
      key: "built",
      label: "Built in",
      value: plural(stat.package, "deck", "decks"),
      detail: `${Math.round(stat.buildRate * 100)}% of decks`,
      tip: "Decks with 2 or more cards on each side of one of its wires, 3 or more in all, in the date range.",
    },
    {
      key: "had",
      label: "Had the cards",
      value: plural(stat.has3, "deck", "decks"),
      detail: "3 or more of its cards",
      tip: "Decks carrying at least three of its cards, built or not.",
    },
    {
      key: "together",
      label: "Came together",
      value: cameTogetherText(stat),
      detail: "of the decks with its cards",
      tip: "How often the cards, once in a deck, formed the package.",
    },
  ]
}

// colorCell is one cell of the support-by-color table: the group's card count
// in the column, and whether the server marked it thin.
export function colorCell(row, color) {
  return { value: row.counts[color] || 0, thin: row.thin.includes(color) }
}

// chartSeries turns the builds per draft into the chart's lines: the smoothed
// rate, each draft's own rate (null for a draft with no decks), and which
// drafts are in the date range.
export function chartSeries(overTime) {
  return {
    labels: overTime.map(d => d.date),
    smoothed: overTime.map(d => d.smoothed),
    raw: overTime.map(d => {
      if (d.decks === 0) {
        return null
      }
      return Math.round(1000 * d.built / d.decks) / 10
    }),
    inRange: overTime.map(d => d.in_range),
  }
}
