// All the text the Colors page shows, in one place so it can be edited without
// touching component code. One key per component file; text with values in it
// is a function that takes named values and returns the whole sentence.

export const COLORS_COPY = {
  // ColorWidget.js: the labels of the measures the two charts over time offer.
  widget: {
    chartBuilds: "Build %",
    chartWins: "Win %",
    chartPicks: "Pick %",
    chartSplash: "Avg Deck Devotion",
    chartVpPct: "VP %",
    chartVps: "Victory Points",
    chartPercentOfWins: "% of wins",
    chartWinningPct: "Winning %",
    chartTrophyPct: "Trophy %",
    chartLastPlacePct: "Last Place %",
  },

  // ColorStatsTable.js: the column headers with their hover text, the win
  // interval popover, and the controls above the table.
  statsTable: {
    color: {
      text: "Color",
      tip: "The color or colors of the deck. If 'strict' is checked, the row includes data only from decks that are exactly this color. Otherwise, the row includes data from any decks that include this color/colors.",
    },
    winPct: {
      text: "Win %",
      tip: "Percentage of games played by this color/colors that were wins. Greyed when it can't be told apart from a coin flip at the chosen confidence; hover for the interval.",
    },
    delta: {
      text: "Δ vs avg",
      tip: "Win rate relative to the cube-wide average (50%). Positive (green) means this color wins more than its share of games; negative (red) means it loses more.",
    },
    buildPct: {
      text: "Build %",
      tip: "Percentages of all built decks that include this color/colors.",
    },
    percentOfWins: {
      text: "% of wins",
      tip: "Share of wins among rows of this same identity length (mono, dual, tri). Sums to ~100% within each view.",
    },
    victoryPointPct: {
      text: "Victory point %",
      tip: "Weighted win contribution of this color, as a percentage of total wins across all decks.",
    },
    trophies: {
      text: "Trophies",
      tip: "Number of 3-0 decks of this color.",
    },
    lastPlace: {
      text: "Last place",
      tip: "Number of 0-3 decks of this color.",
    },
    winning: {
      text: "Winning",
      tip: "Number of 2-1 or better.",
    },
    losing: {
      text: "Losing",
      tip: "Number of 1-2 or worse.",
    },
    winningPct: {
      text: "Winning %",
      tip: "Percentage of decks with a 2-1 or better match record.",
    },
    decks: {
      text: "# Decks",
      tip: "Number of decks in this row.",
    },
    pickPct: {
      text: "Pick %",
      tip: "This color's share of all mainboarded cards across every deck. Sums to ~100% across rows.",
    },
    devotion: {
      text: "Avg Deck Devotion",
      tip: "For each deck, the fraction of colored mana symbols matching this color identity, then averaged across decks. Each deck contributes equally regardless of size.",
    },
    avgWords: {
      text: "Avg Words",
      tip: "Average word count per non-land card in decks with this color, excluding reminder text.",
    },

    notDistinguishable: "not distinguishable from 50%",
    distinguishable: "distinguishable from 50%",
    winInterval: ({ low, high, verdict }) => `${low}–${high}% · ${verdict}`,

    colorTypeLabel: "Color type",
    bucketLabel: "Bucket",
    allBuckets: "ALL",
    colorModeLabel: "Color mode",
    modeInclusive: "Inclusive",
    modeExact: "Exact",
    modePrimary: "Primary pair",
  },

  // ColorRateCharts.js: chart titles, axis titles, and the legend and tooltip text.
  rateCharts: {
    deltaDatasetLabel: "Win rate vs cube average",
    deltaTitle: "Net performance vs cube average (win %)",
    deltaAxisTitle: "Δ win % vs 50%",
    deltaTooltip: ({ sign, delta, winPercent, numDecks }) => `${sign}${delta}% (win ${winPercent}%, ${numDecks} decks)`,

    white: "White",
    blue: "Blue",
    black: "Black",
    red: "Red",
    green: "Green",

    buildsTitle: (bucketSize) => `Build % (bucket size = ${bucketSize} drafts)`,
    winsTitle: (bucketSize) => `Win % (buckets size = ${bucketSize} drafts)`,
    vpsTitle: (bucketSize) => `Victory points (bucket size = ${bucketSize} drafts)`,
    possibleVpsTitle: (bucketSize) => `Possible victory points (bucket size = ${bucketSize} drafts)`,
    vpsPctTitle: (bucketSize) => `Percentage of victory points (bucket size = ${bucketSize} drafts)`,
    pickPercentageTitle: (bucketSize) => `Percentage of mainboard picks (bucket size = ${bucketSize} drafts)`,
    splashTitle: (bucketSize) => `Avg. percentage of decks (bucket size = ${bucketSize} drafts)`,
    percentOfWinsTitle: (bucketSize) => `Percent of wins (bucket size = ${bucketSize} drafts)`,
    winningPctTitle: (bucketSize) => `Winning % (bucket size = ${bucketSize} drafts)`,
    trophyPctTitle: (bucketSize) => `Trophy % (bucket size = ${bucketSize} drafts)`,
    lastPlacePctTitle: (bucketSize) => `Last place % (bucket size = ${bucketSize} drafts)`,
  },

  // ColorMatchupHeatmap.js: the heatmap's title, color group names, and cell popover.
  heatmap: {
    monoTitle: "Mono-Color Matchup Heatmap",
    trioTitle: "Trio-Color Matchup Heatmap",
    pairTitle: "Color Pair Matchup Heatmap",

    // Keyed by color letters, the way the matchup data is.
    groupNames: {
      W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
      WU: "Azorius", WB: "Orzhov", WR: "Boros", WG: "Selesnya",
      UB: "Dimir", UR: "Izzet", UG: "Simic", BR: "Rakdos", BG: "Golgari", RG: "Gruul",
      WUB: "Esper", WUR: "Jeskai", WUG: "Bant", WBR: "Mardu", WBG: "Abzan",
      WRG: "Naya", UBR: "Grixis", UBG: "Sultai", URG: "Temur", BRG: "Jund",
    },

    cellTitle: ({ mine, opponent }) => `${mine} vs ${opponent}`,
    cellRecord: ({ wins, losses, total }) => `${wins}W - ${losses}L (${total} games)`,
  },
}
