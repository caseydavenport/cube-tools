// Pure helpers behind the Removal page's coverage-against-cost scatter, kept
// free of React so node tests can load them.

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

// nameSpread turns a card name into a number between -0.3 and 0.3, the same
// every time, so cards at one cost sit side by side instead of on top of each
// other.
function nameSpread(name) {
  let hash = 0
  for (const ch of name) {
    hash = (hash * 31 + ch.codePointAt(0)) % 1000
  }
  return (hash / 999) * 0.6 - 0.3
}

// scatterX is where a card sits on the cost axis: its effective cost, nudged
// a little by its name.
export function scatterX(card) {
  return card.eff_cost + nameSpread(card.name)
}

// scatterSeries groups the cards into one series per color group, in
// GROUP_ORDER, each point carrying what its tooltip shows. Scalable cards have
// no coverage, so they're left out, and so are groups with no cards. mode
// "played" plots play-weighted coverage; anything else plots raw coverage.
export function scatterSeries(cards, mode) {
  const byGroup = new Map()
  for (const card of cards) {
    if (card.scalable) {
      continue
    }
    let coverage = card.pct_cube
    if (mode === "played") {
      coverage = card.pct_played
    }
    const group = colorGroup(card.colors)
    if (!byGroup.has(group)) {
      byGroup.set(group, [])
    }
    byGroup.get(group).push({
      x: scatterX(card),
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
