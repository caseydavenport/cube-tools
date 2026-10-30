// Pure helpers behind the Removal page's scatter and hard-to-remove table,
// kept free of React so node tests can load them.

// GROUP_ORDER is the fixed order of the scatter's color groups, so a color
// keeps its place in the legend whatever the filter shows.
export const GROUP_ORDER = ["W", "U", "B", "R", "G", "multi", "colorless"]

// colorGroup sorts a card into its scatter group: its one color, "multi" for
// two or more, or "colorless".
export function colorGroup(colors) {
  if (!colors || colors.length === 0) {
    return "colorless"
  }
  if (colors.length > 1) {
    return "multi"
  }
  return colors[0]
}

// SPREAD is how far, in cost units, the dots in one crowded spot fan out to
// either side of their cost.
const SPREAD = 0.3

// CLUSTER_PERCENT groups dots whose coverage is this close, since a mana
// symbol is about that tall on the chart.
const CLUSTER_PERCENT = 5

// coverageOf is the coverage a card plots at: play-weighted in "played" mode,
// raw otherwise.
function coverageOf(card, mode) {
  if (mode === "played") {
    return card.pct_played
  }
  return card.pct_cube
}

// spreadOffsets gives each card a sideways nudge so cards at one cost and a
// similar coverage sit side by side, evenly spaced in name order, instead of
// on top of each other. A card alone in its spot stays on its cost.
function spreadOffsets(cards, mode) {
  const clusters = new Map()
  for (const card of cards) {
    const key = `${card.eff_cost}|${Math.round(coverageOf(card, mode) / CLUSTER_PERCENT)}`
    if (!clusters.has(key)) {
      clusters.set(key, [])
    }
    clusters.get(key).push(card)
  }

  const offsets = new Map()
  for (const cluster of clusters.values()) {
    if (cluster.length === 1) {
      offsets.set(cluster[0], 0)
      continue
    }
    const step = (2 * SPREAD) / (cluster.length - 1)
    cluster.forEach((card, i) => offsets.set(card, -SPREAD + i * step))
  }
  return offsets
}

// scatterSeries groups the cards into one series per color group, in
// GROUP_ORDER, each point carrying what its tooltip shows. Scalable cards have
// no coverage, so they're left out, and so are groups with no cards. mode
// "played" plots play-weighted coverage; anything else plots raw coverage.
// Points come in name order, so re-sorting the table doesn't move them.
export function scatterSeries(cards, mode) {
  const plotted = cards.filter(card => !card.scalable).sort((a, b) => a.name.localeCompare(b.name))
  const offsets = spreadOffsets(plotted, mode)

  const byGroup = new Map()
  for (const card of plotted) {
    const coverage = coverageOf(card, mode)
    const group = colorGroup(card.colors)
    if (!byGroup.has(group)) {
      byGroup.set(group, [])
    }
    byGroup.get(group).push({
      x: card.eff_cost + offsets.get(card),
      y: coverage,
      name: card.name,
      cost: card.eff_cost,
      coverage,
      restriction: card.restriction,
    })
  }

  const series = []
  for (const group of GROUP_ORDER) {
    if (byGroup.has(group)) {
      series.push({ group, points: byGroup.get(group) })
    }
  }
  return series
}

// hardToRemoveRows orders creatures hardest to answer first for a deck of the
// chosen color ("" for any): fewest answers, then highest mana value, then by
// name. The server counts each color's answers; this only picks and sorts.
export function hardToRemoveRows(creatures, color) {
  return [...creatures].sort((a, b) => {
    const answersA = a.answers[color] || 0
    const answersB = b.answers[color] || 0
    if (answersA !== answersB) {
      return answersA - answersB
    }
    if (a.mv !== b.mv) {
      return b.mv - a.mv
    }
    return a.name.localeCompare(b.name)
  })
}
