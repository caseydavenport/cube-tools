// Pure helpers for the package page, kept free of React so node tests can
// load them: the header's text, color cells, and the chart's data.

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

// headerLine is the header's line of numbers in words, each with a tip that
// gives the exact rule: decks that built it, linked pairs in a typical build,
// and, when showWinRate, how those decks did.
export function headerLine(page, showWinRate) {
  const items = [
    {
      key: "built",
      text: `${plural(page.stat.package, "deck", "decks")} built it`,
      tip: "Decks with 2+ cards from each side of one wire, and 3+ of its cards.",
    },
    {
      key: "pairs",
      text: `${page.map.typical_pairs} linked pairs in a typical build`,
      tip: "In each deck, one side's cards times the other side's, added up over the wires. The middle value over decks that built it.",
    },
  ]
  if (showWinRate) {
    items.push({
      key: "win",
      text: `${Math.round(page.stat.record.bayesian_win_percent)}% win rate`,
      tip: "How the decks that built it did, Bayes-adjusted.",
    })
  }
  return items
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
