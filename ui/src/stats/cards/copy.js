// All the text the Cards page shows, in one place so it can be edited without
// touching component code. One key per component file; text with values in it
// is a function that takes named values and returns the whole sentence.

export const CARDS_COPY = {
  // CardWidget.js: the page's section names and headings.
  widget: {
    sectionStats: "Stats",
    sectionTrends: "Trends",
    sectionPlots: "Plots",
    sectionPickOrder: "Pick Order",
    statsHeading: "Card Stats",
    trendsHeading: "Trends",
    plotsHeading: "Plots",
    pickOrderHeading: "Pick Order",
  },

  // CardStatsTable.js: the controls above the table.
  statsTable: {
    // These are both the dropdown labels and the values the table switches on.
    matchInteraction: "All interaction",
    matchCounterspells: "Counterspells",
    matchRemoval: "Removal",
    matchLand: "Land",
    matchNonland: "Nonland",

    tagDna: "DNA",
    tagWatch: "Watch",
    tagRemove: "Remove",

    // Also the values the table switches on.
    typeOverview: "Overview",
    typeMetadata: "Metadata",
    typeVersusArchetype: "Versus archetype",
    typeByArchetype: "By archetype",

    filterLabel: "Filter Cards",
    filterPlaceholder: "Search visible cards (e.g. name:bolt, t:creature)",
    showing: (count) => `Showing ${count} cards`,
    statsTypeLabel: "Stats type",
    matchLabel: "Match",
    tagLabel: "Tag",
    significantOnly: "Significant only",
  },

  // cardColumns.js: table headers (text), their hover text (tip), and the
  // popovers on the name, Deck%, and Win% cells.
  columns: {
    colorIdentity: { text: "Color Identity", tip: "Color identity of the card." },
    card: { text: "Card", tip: "Card name. Click a row cell to focus the card in the graphs below." },
    games: { text: "# Games", tip: "Number of games played by decks that included this card." },
    deckPct: { text: "Deck%", tip: "Percentage of drafts this card is mainboarded. Hover for exact board counts." },
    winPct: { text: "Win%", tip: "Win rate of decks that mainboard this card. Greyed when it can't be told apart from a coin flip at the chosen confidence. Hover for the confidence interval and record." },
    deltaExp: { text: "Δ Exp", tip: "Win% minus expected win% - how the card over/underperforms relative to the players who ran it." },
    pickElo: { text: "Pick ELO", tip: "An ELO ranking based on card pick order in packs." },
    matchElo: { text: "Match ELO", tip: "An ELO ranking computed from match results, weighted by opponent strength." },
    lastPlayed: { text: "Last played", tip: "Date of the draft this card was last mainboarded." },
    words: { text: "Words", tip: "Words in the card's oracle text, excluding reminder text." },
    tags: { text: "# Tags", tip: "Number of unique tags on decks that have mainboarded this card." },
    players: { text: "# Players", tip: "Number of unique players who have mainboarded this card." },
    vsAggro: { text: "vs Aggro", tip: "Win rate when this card's deck plays against aggro archetypes." },
    vsControl: { text: "vs Control", tip: "Win rate when this card's deck plays against control archetypes." },
    vsMidrange: { text: "vs Midrange", tip: "Win rate when this card's deck plays against midrange archetypes." },
    inAggro: { text: "in Aggro", tip: "Win rate of this card when played in aggro decks." },
    inControl: { text: "in Control", tip: "Win rate of this card when played in control decks." },
    inMidrange: { text: "in Midrange", tip: "Win rate of this card when played in midrange decks." },

    playedByTitle: "Played by",
    deckLinkTip: "Open decks that mainboarded this card (same filters & time range)",

    boardCountsTitle: "Board counts",
    mainboarded: "Mainboarded",
    sideboarded: "Sideboarded",
    playableSideboard: "Playable sideboard",

    winDetailTitle: "Win detail",
    record: "Record",
    winPercent: "Win %",
    interval: (confPct) => `${confPct}% interval`,
    beatsCoinFlip: "Beats a coin flip",
    yes: "yes",
    no: "no",
    trophies: "Trophies (3-0)",
    lastPlace: "Last place (0-3)",
    percentOfWins: "% of all wins",
  },

  // CardTooltip.js: the tables in the card name popover.
  tooltip: {
    player: "Player",
    mainboardCount: "# MB",
    sideboardCount: "# SB",
    archetype: "Archetype",
  },

  // CardScatter.js: the axis choices (also the values the plot switches on),
  // the chart's labels, and its hover text.
  scatter: {
    axisNumDecks: "# Decks",
    axisNumSideboard: "# Sideboard",
    axisMainboardPercent: "Mainboard %",
    axisSideboardPercent: "Sideboard %",
    axisWinPercent: "Win %",
    axisWinPercentVsAvg: "Win % vs avg",
    axisPercentOfWins: "% of Wins",
    axisNumWins: "# Wins",
    axisExpectedWinPercent: "Expected Win %",
    axisPickElo: "Pick ELO",
    axisMatchElo: "Match ELO",
    axisNumGames: "# Games",
    axisManaValue: "Mana Value",
    axisNumPlayers: "# Players",
    axisDraftPick: "Avg. draft pick",
    axisNumTrophies: "# Trophies",
    axisNumLastPlace: "# Last place",
    axisVsAggro: "vs Aggro Win %",
    axisVsControl: "vs Control Win %",
    axisVsMidrange: "vs Midrange Win %",
    axisInAggro: "in Aggro Win %",
    axisInControl: "in Control Win %",
    axisInMidrange: "in Midrange Win %",
    axisWordCount: "Word Count",

    allCardsLabel: "All cards",
    cubeAverageLabel: "Cube average",
    xAxisLabel: "X Axis",
    yAxisLabel: "Y Axis",
    title: ({ y, x }) => `${y} vs. ${x} (all drafts)`,
    pointLabel: ({ card, x, xValue, y, yValue }) => `${card}: ${x} ${xValue}, ${y} ${yValue}`,
  },

  // CardTrendCharts.js: the three Trends charts.
  trendCharts: {
    pickRateEmpty: "Select a card to chart its play rate over time.",
    eloEmpty: "Select a card to chart its ELO over time.",
    winRateEmpty: "Select a card to chart its win rate over time.",

    mainboardLabel: "Mainboard %",
    sideboardLabel: "Sideboard %",
    playableSideboardLabel: "Playable sb %",
    pickRateTitle: ({ name, bucketSize }) => `${name} % (bucket size = ${bucketSize} drafts)`,
    pickRateAxis: "Pick %",

    eloLabel: "ELO",
    eloTitle: ({ name, bucketSize }) => `${name} ELO (bucket size = ${bucketSize} drafts)`,
    eloAxis: "Pick ELO",

    winLabel: "Win %",
    allWinsLabel: "% of all Wins",
    winRateTitle: ({ name, bucketSize }) => `${name} win % (bucket size = ${bucketSize} drafts)`,
    winRateAxis: "Win %",

    datesAxis: "Dates",
  },

  // PickOrder.js: the Pick Order table, its filters, and the pick popover.
  pickOrder: {
    cardName: { text: "Card name", tip: "The card's name." },
    drafts: { text: "# Drafts", tip: "Number of drafts that have included this card." },
    p1p1: { text: "# P1P1", tip: "Number of times this card has been selected pick 1 of pack 1." },
    avgP1Pick: { text: "Avg. p1 pick", tip: "Average pick, limited exclusively to instances where this card was present in pack #1." },
    avgPick: { text: "Avg. pick", tip: "Average pick for this card within a pack (i.e., out of 15)." },
    avgPickAbs: { text: "Avg. pick (abs)", tip: "Average pick for this card across all packs (i.e., out of 45). Mostly silly, but fun to look at." },
    pickDeviation: { text: "Pick deviation", tip: "Pick order standard deviation. A higher number means this card has a higher variance in pick order." },
    p1Burns: { text: "# P1 Burns", tip: "For drafts that burn cards, the number of times this card was burned in pack #1." },
    burns: { text: "# Burns", tip: "For drafts that burn cards, the number of times that this card was burned in total." },

    minDev: "Min dev",
    maxDev: "Max dev",
    minDrafts: "Min drafts",
    minAvg: "Min avg",
    maxAvg: "Max avg",

    date: "Date",
    player: "Player",
    pack: "Pack",
    pick: "Pick",
  },
}
