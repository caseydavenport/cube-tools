// All the text the Colors page shows, in one place so it can be edited without
// touching component code. One key per component file; text with values in it
// is a function that takes named values and returns the whole sentence.

export const COLORS_COPY = {
  // ColorWidget.js: the chart over time's group picker.
  widget: {
    trendPickerLabel: "Color groups to chart",
    trendPickerPlaceholder: "Pick up to 3",

    // The color-type control, which Stats.js builds.
    typeAny: "Any",
    typeMono: "Mono",
    typeDual: "Dual",
    typeTrio: "Trio",
  },

  // ColorStatsTable.js: the column headers with their hover text, the win
  // interval popover, and the controls above the table.
  statsTable: {
    color: {
      text: "Color",
      tip: "The colors of the decks bucketed into this row. Color mode controls whether the row represents any deck that includes these colors (inclusive), only decks with exactly this color identity (exact), or only decks where these are the primary two colors (primary pair).",
    },
    bayesWinPct: {
      text: "Win %",
      tip: "Bayes win rate: pulled toward the cube average in proportion to how few games a row has. Always unreliable: color win rates sit within about a point of chance in this cube, so this mostly reflects luck. Hover for the raw win %, its interval and the games.",
    },
    buildPct: {
      text: "Build %",
      tip: "Percentages of all built decks that include this color/colors.",
    },
    decks: {
      text: "# Decks",
      tip: "Number of decks in this row.",
    },
    pickPct: {
      text: "Pick %",
      tip: "This color's share of all mainboarded cards across every deck. Sums to ~100% across rows.",
    },


    colorTypeLabel: "Color type",
    bucketLabel: "Bucket",
    allBuckets: "ALL",
    colorModeLabel: "Color mode",
    modeInclusive: "Inclusive",
    modeExact: "Exact",
    modePrimary: "Primary pair",
  },

  // ColorRateCharts.js: chart titles, axis titles, captions and tooltips.
  rateCharts: {
    deltaDatasetLabel: "Bayes win % vs cube average",
    deltaTitle: "Net performance vs cube average",
    deltaSubtitle: "Bayes win % minus 50%, with the raw rate's interval as a whisker. Grey bars can't be told apart from a coin flip.",
    deltaAxisTitle: "Δ win % vs 50%",
    deltaTooltip: ({ sign, delta, winPercent, numDecks }) => `${sign}${delta} pts Bayes (raw ${winPercent}%, ${numDecks} decks)`,
    intervalLabel: "Interval",
    intervalTooltip: ({ low, high }) => `Raw win % interval: ${low}% to ${high}%`,

    bucketCaption: (bucketSize) => `Each point covers ${bucketSize} drafts`,
  },

  // ColorMatchupHeatmap.js: the heatmap's title, notes and cell popover.
  heatmap: {
    monoTitle: "Matchups by color",
    pairTitle: "Matchups by color pair",
    pairsInsteadNote: "Showing pairs: three-color groups leave almost every pairing with a handful of games.",
    shadingNote: "Each cell is the row's Bayes win % against the column. Only cells that can be told apart from a coin flip are colored.",

    cellTitle: ({ mine, opponent }) => `${mine} vs ${opponent}`,
    cellRecord: ({ wins, losses, total }) => `${wins}W - ${losses}L (${total} games)`,
    cellRecordLabel: "Record",
    rawLabel: "Raw win %",
    intervalLabel: "Interval",
    footerDifferent: "different from 50%",
    footerSame: "can't be told apart from 50%",
  },
}
