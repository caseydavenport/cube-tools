// Which data each stats page needs, so a page only asks the server for what
// it shows. Kept free of React so node tests can load it.

// ALL_SOURCES names every piece of data the stats pages load.
export const ALL_SOURCES = [
  "decks", "cube", "drafts", "archetypeMatchups",
  "cardStats", "cardStatsOverTime",
  "colorStats", "colorStatsOverTime", "colorMatchups",
  "archetypeStats", "archetypeStatsOverTime", "playerStats", "deckCharts",
  "synergy", "synergyCompare",
  "designGraph", "health",
]

// VIEW_SOURCES lists the data each page reads. decks feed the toolbar's
// summary on every page but the Synergy map, and cube feeds the filter's card
// suggestions.
export const VIEW_SOURCES = {
  cards: ["decks", "cube", "drafts", "cardStats", "cardStatsOverTime", "archetypeStats", "playerStats"],
  colors: ["decks", "cube", "colorStats", "colorStatsOverTime", "colorMatchups"],
  types: ["decks", "cube", "archetypeMatchups", "cardStats", "archetypeStats", "archetypeStatsOverTime"],
  deckstats: ["decks", "cube", "drafts", "archetypeStats", "playerStats", "deckCharts"],
  synergy: ["decks", "cube", "synergy", "synergyCompare"],
  health: ["decks", "cube", "health"],
  designmap: ["cube", "designGraph"],
  players: ["decks", "cube", "playerStats"],
}

// viewNeeds reports whether a page needs a source. A page the table doesn't
// know loads everything, so a new page never shows empty charts.
export function viewNeeds(view, source) {
  const sources = VIEW_SOURCES[view]
  if (sources === undefined) {
    return true
  }
  return sources.includes(source)
}
