// All the text the Archetypes page shows, in one place so it can be edited
// without touching component code. One key per component file; text with
// values in it is a function that takes named values and returns the sentence.

export const ARCHETYPES_COPY = {
  // ArchetypeWidget.js: the chart choices, section names, and controls.
  widget: {
    chartManaCurve: "Mana curve by archetype",
    chartTypeMix: "Card types by archetype",
    chartCloseMatches: "Close matches by archetype",
    chartDelta: "Archetype Δ vs avg",
    chartBuilds: "Archetype Build %",
    chartWins: "Archetype Win %",
    chartPercentOfWins: "Archetype % of wins",
    chartWinningPct: "Archetype Winning %",
    chartTrophyPct: "Archetype Trophy %",
    chartLastPlacePct: "Archetype Last Place %",
    chartCmc: "Archetype CMC",
    matchupAggro: "Matchup: Aggro",
    matchupMidrange: "Matchup: Midrange",
    matchupControl: "Matchup: Control",
    tagBuilds: "Tag Build %",
    tagWins: "Tag Win %",
    tagWinningPct: "Tag Winning %",
    tagTrophyPct: "Tag Trophy %",
    tagLastPlacePct: "Tag Last Place %",
    tagPercentOfWins: "Tag % of wins",
    sectionArchetypes: "Archetypes",
    sectionCharts: "Charts",
    finishesHeading: "How their decks finished",
    chartsHeading: "Charts",
    chartLabel: "Chart",
  },

  // ArchetypeStatsTable.js: the column headers with their hover text, the win
  // interval popover, and the two table headings.
  statsTable: {
    tag: {
      text: "Tag",
      tip: "A tag applied to decks. A deck may have several tags.",
    },
    archetype: {
      text: "Archetype",
      tip: "The deck's macro archetype: aggro, midrange or control. Each deck has one.",
    },
    decks: {
      text: "Decks",
      tip: "Decks with this archetype or tag, then their share of all built decks.",
    },
    bayesWinPct: {
      text: "Win %",
      tip: "Bayes win rate: pulled toward the cube average in proportion to how few games a row has. Always unreliable: archetype game win rates sit within chance of each other here. Hover for the raw win %, its interval and the games.",
    },
    winningPct: {
      text: "Winning records",
      tip: "Share of its decks that finished 2-1 or better. Hover for trophies, winning and losing records, and last places.",
    },
    finishesTitle: ({ decks }) => `How its ${decks} decks finished`,
    trophies: "Trophies (3-0)",
    winning: "Winning (2-1 or better)",
    losing: "Losing (1-2 or worse)",
    lastPlace: "Last place (0-3)",
    avgOtherTypes: {
      text: "Other tags",
      tip: "How many other tags the average deck in this row also carries, not counting aggro, midrange or control. Near 0 means the theme usually stands alone; 2 or more means it usually comes with others.",
    },
    tooFewDecks: "—",
    tagsHeading: "Tags",
    archetypesHeading: "Archetypes",
    tableTabsLabel: "Archetypes or tags",
  },

  // ArchetypeCharts.js: the chart titles, axis and series labels, and the
  // delta bar tooltip.
  charts: {
    deltaSeries: "Win rate vs cube average",
    deltaTitle: "Net performance vs cube average (win %)",
    deltaAxis: "Δ win % vs 50%",
    deltaTooltip: ({ sign, delta, winPercent, count }) => `${sign}${delta}% (win ${winPercent}%, ${count} decks)`,
    aggro: "Aggro",
    midrange: "Midrange",
    control: "Control",
    buildRateTitle: ({ bucketSize }) => `Build rate (bucket size = ${bucketSize} drafts)`,
    winRateTitle: ({ bucketSize }) => `Win rate (bucket size = ${bucketSize} drafts)`,
    avgManaValueTitle: ({ bucketSize }) => `Avg. mana value (bucket size = ${bucketSize} drafts)`,
    percentOfAllWinsTitle: ({ bucketSize }) => `Percent of all wins (bucket size = ${bucketSize} drafts)`,
    winningPctTitle: ({ bucketSize }) => `Winning % (bucket size = ${bucketSize} drafts)`,
    trophyPctTitle: ({ bucketSize }) => `Trophy % (bucket size = ${bucketSize} drafts)`,
    lastPlacePctTitle: ({ bucketSize }) => `Last place % (bucket size = ${bucketSize} drafts)`,
  },

  // TagCharts.js: the tags-over-time chart titles.
  tagCharts: {
    buildRateTitle: ({ bucketSize }) => `Build rate (bucket size = ${bucketSize} drafts)`,
    winRateTitle: ({ bucketSize }) => `Win rate (bucket size = ${bucketSize} drafts)`,
    avgManaValueTitle: ({ bucketSize }) => `Avg. mana value (bucket size = ${bucketSize} drafts)`,
    percentOfWinsTitle: ({ bucketSize }) => `Percent of wins (bucket size = ${bucketSize} drafts)`,
    winningPctTitle: ({ bucketSize }) => `Winning % (bucket size = ${bucketSize} drafts)`,
    trophyPctTitle: ({ bucketSize }) => `Trophy % (bucket size = ${bucketSize} drafts)`,
    lastPlacePctTitle: ({ bucketSize }) => `Last place % (bucket size = ${bucketSize} drafts)`,
  },

  // WinsByMatchup.js: the chart title and series labels.
  matchup: {
    title: ({ name }) => `Matchup data for ${name}`,
    winPct: "Win %",
    wins: "Wins",
    losses: "Losses",
  },
}
