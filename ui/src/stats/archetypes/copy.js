// All the text the Archetypes page shows, in one place so it can be edited
// without touching component code. One key per component file; text with
// values in it is a function that takes named values and returns the sentence.

export const ARCHETYPES_COPY = {
  // ArchetypeWidget.js: the Trends chart choices, section names, and controls.
  widget: {
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
    pieBuilds: "Pie: Builds",
    pieWins: "Pie: Wins",
    tagBuilds: "Tag Build %",
    tagWins: "Tag Win %",
    tagWinningPct: "Tag Winning %",
    tagTrophyPct: "Tag Trophy %",
    tagLastPlacePct: "Tag Last Place %",
    tagPercentOfWins: "Tag % of wins",
    sectionArchetypes: "Archetypes",
    sectionSelected: "Selected Archetype",
    sectionTrends: "Trends",
    colors: "Colors",
    selectedHeading: ({ archetype }) => `Selected — ${archetype}`,
    trendsHeading: "Trends",
    leftChart: "Left Chart",
    rightChart: "Right Chart",
  },

  // ArchetypeStatsTable.js: the column headers with their hover text, the win
  // interval popover, and the two table headings.
  statsTable: {
    tag: {
      text: "Tag",
      tip: "Archetype (aggro / midrange / control) or tag applied to a deck. A deck may have multiple tags",
    },
    buildPct: {
      text: "Build %",
      tip: "Percentage of all built decks that have this archetype / tag.",
    },
    winPct: {
      text: "Win %",
      tip: "Win percentage of decks that have this archetype / tag. Greyed when it can't be told apart from a coin flip at the chosen confidence; hover for the interval.",
    },
    percentOfWins: {
      text: "% of wins",
      tip: "Number of wins from decks with this tag, divided by the total number of wins across all decks.",
    },
    trophies: {
      text: "Trophies",
      tip: "Number of 3-0 decks of this archetype / tag.",
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
      text: "Avg other types",
      tip: "Average number of other tags applied to decks with this archetype / tag.",
    },
    avgWords: {
      text: "Avg Words",
      tip: "Average word count per non-land card in decks with this archetype, excluding reminder text.",
    },
    tooFewDecks: "—",
    notDistinguishable: "not distinguishable from 50%",
    distinguishable: "distinguishable from 50%",
    winInterval: ({ low, high, verdict }) => `${low}–${high}% · ${verdict}`,
    tagsHeading: "Tags",
    archetypesHeading: "Archetypes",
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
    pieDecks: "Decks",
    pieWins: "Wins",
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

  // TopCardsInArchetype.js: the controls, the top cards table headers with
  // hover text, and the two small tables under it.
  topCards: {
    archetype: "Archetype",
    color: "Color",

    // The color dropdown's choices, which Stats.js builds.
    colorRed: "Red",
    colorBlue: "Blue",
    colorGreen: "Green",
    colorBlack: "Black",
    colorWhite: "White",

    minPicks: "Min picks",
    decksInArch: "Decks in arch",
    card: {
      text: "Card",
      tip: "The card's name.",
    },
    focalScore: {
      text: "Focal Score",
      tip: "Combines include rate and correlation to identify cards that define the archetype. High scores indicate cards that are both common in this archetype and rarely seen outside of it.",
    },
    numDecks: {
      text: "# Decks",
      tip: "Number of times this card has been mainboarded in decks with the selected archetype / tag.",
    },
    includeRate: {
      text: "Include rate",
      tip: "Percentage of decks in the selected archetype / tag that include this card.",
    },
    correlation: {
      text: "Correlation",
      tip: "How correlated this card is with the selected archetype / tag. Percentage of decks that this card has been mainboarded in that have the selected archetype / tag.",
    },
    heading: "Top Cards in Archetype",
    pairedWith: "Paired With",
    pairedArchetype: "Archetype",
    playedBy: "Played By",
    playedByPlayer: "Player",
    countHeader: "#",
    // draft: explainers for the "#" header of the Paired With and Played By tables.
    pairedCountTip: "Number of decks of the selected archetype or tag that also carry the paired archetype.",
    playedByCountTip: "Number of decks of the selected archetype or tag that this player built.",
  },

  // WinsByMatchup.js: the chart title and series labels.
  matchup: {
    title: ({ name }) => `Matchup data for ${name}`,
    winPct: "Win %",
    wins: "Wins",
    losses: "Losses",
  },
}
