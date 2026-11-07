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
    buildPct: {
      text: "Build %",
      tip: "Percentage of all built decks that have this archetype / tag.",
    },
    percentOfWins: {
      text: "% of wins",
      tip: "Number of wins from decks with this tag, divided by the total number of wins across all decks.",
    },
    trophies: {
      text: "Trophies",
      tip: "Number of 3-0 decks of this archetype / tag.",
    },
    bayesWinPct: {
      text: "Bayes Win %",
      tip: "Win rate pulled toward the cube average in proportion to how few games a row has, so a tag with one lucky deck doesn't top the table. Greyed when it can't be told apart from 50%. Hover for the raw win %, its interval, the games and the difference from average.",
    },
    lastPlace: {
      text: "Last place",
      tip: "Number of 0-3 decks of this archetype / tag.",
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
    numDecks: {
      text: "# Decks",
      tip: "Total number of decks with this archetype / tag.",
    },
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
