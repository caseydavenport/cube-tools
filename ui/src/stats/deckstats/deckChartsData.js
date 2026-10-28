// Shapes the server's Deck Stats charts answer for the chart components.
// Kept free of React so node tests can load it.

// NO_DECK_CHARTS is what the charts show before the answer arrives.
export const NO_DECK_CHARTS = {
  head_to_head: {},
  close_matches: [],
  forest: [],
  mana_curve: [],
  type_mix: [],
  splash: [],
}

// listOrEmpty returns value, or an empty list when the server left it out.
function listOrEmpty(value) {
  if (Array.isArray(value)) {
    return value
  }
  return []
}

// toDeckCharts fills in any chart the answer is missing, so the components
// never have to check for null.
export function toDeckCharts(response) {
  let headToHead = response.head_to_head
  if (headToHead == null) {
    headToHead = {}
  }
  return {
    head_to_head: headToHead,
    close_matches: listOrEmpty(response.close_matches),
    forest: listOrEmpty(response.forest),
    mana_curve: listOrEmpty(response.mana_curve),
    type_mix: listOrEmpty(response.type_mix),
    splash: listOrEmpty(response.splash),
  }
}

// forestPoints splits the forest rows into the lists the chart draws: a dot at
// each effect and a bar across each interval. A row with no effect gets null
// for both and a true note, so the chart can say why it's empty.
export function forestPoints(rows) {
  const labels = []
  const dots = []
  const bars = []
  const notes = []
  for (const row of rows) {
    labels.push(row.key)
    if (row.has_effect) {
      dots.push(row.effect)
      bars.push([row.effect_low, row.effect_high])
      notes.push(false)
    } else {
      dots.push(null)
      bars.push(null)
      notes.push(true)
    }
  }
  return { labels, dots, bars, notes }
}
