// The sidebar's page model: which pages exist, how they group, and what data
// each needs before it has anything to show.

// REASONS is the short note a dimmed page shows for the data it's missing.
export const REASONS = {
  decks: "needs decks",
  results: "needs results",
  pick_logs: "needs pick logs",
  archetypes: "needs archetypes",
  writable: "read-only",
}

export const NAV_GROUPS = [
  {
    id: "home",
    label: null,
    dividerAfter: null,
    pages: [
      { label: "Home", path: "", icon: "home", needs: [] },
    ],
  },
  {
    id: "cube",
    label: "Cube data",
    dividerAfter: null,
    pages: [
      { label: "Removal", path: "removal", icon: "removal", needs: [] },
      { label: "Synergy map", path: "synergy-map", icon: "map", needs: [] },
    ],
  },
  {
    id: "play",
    label: "Play data",
    dividerAfter: "players",
    pages: [
      { label: "Decks", path: "decks", icon: "decks", needs: ["decks"] },
      { label: "Drafts", path: "drafts", icon: "drafts", needs: ["pick_logs"] },
      { label: "Players", path: "players", icon: "players", needs: ["decks"] },
      { label: "Cards", path: "cards", icon: "cards", needs: ["decks"] },
      { label: "Colors", path: "colors", icon: "colors", needs: ["decks"] },
      { label: "Archetypes", path: "archetypes", icon: "archetypes", needs: ["decks", "archetypes"] },
      { label: "Deck stats", path: "deck-stats", icon: "deckStats", needs: ["decks"] },
      { label: "Synergy", path: "synergy", icon: "synergy", needs: ["decks"] },
      { label: "Packages", path: "packages", icon: "packages", needs: ["decks"] },
      { label: "Charts", path: "charts", icon: "charts", needs: ["decks", "results"] },
      { label: "Health", path: "health", icon: "health", needs: ["decks"] },
    ],
  },
  {
    id: "design",
    label: "Design",
    dividerAfter: null,
    pages: [
      { label: "Rules editor", path: "rules-editor", icon: "rulesEditor", needs: ["writable"] },
    ],
  },
]

// pageAvailability reports whether a cube has the data a page needs, and if not,
// the reason for the first missing piece. Unknown data counts as present so a
// slow or failed info request never dims pages, except writability, which must
// be known to be true.
export function pageAvailability(page, info) {
  for (const key of page.needs) {
    const missing = key === "writable" ? info[key] !== true : info[key] === false
    if (missing) return { available: false, reason: REASONS[key] }
  }
  return { available: true, reason: null }
}
