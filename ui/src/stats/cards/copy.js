// All the text the Cards page shows, in one place so it can be edited without
// touching component code. One key per component file; text with values in it
// is a function that takes named values and returns the whole sentence.

export const CARDS_COPY = {
  // CardWidget.js: the page's section names and headings.
  widget: {
    sectionStats: "Stats",
    sectionPlots: "Plots",
    sectionPickOrder: "Pick Order",
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
    typeArchetypeMix: "Archetype mix",

    filterLabel: "Filter Cards",
    filterPlaceholder: "Search visible cards (e.g. name:bolt, t:creature)",
    showing: (count) => `Showing ${count} cards`,
    statsTypeLabel: "Stats type",
    matchLabel: "Match",
    tagLabel: "Tag",
  },

  // cardColumns.js: table headers (text), their hover text (tip), and the
  // popovers on the name and Popularity cells.
  columns: {
    colorIdentity: { text: "Colors", tip: "Color identity of the card." },
    card: { text: "Card", tip: "Card name. Click a row cell to focus the card in the graphs below." },
    games: { text: "# Games", tip: "Number of games played by decks that included this card." },
    winPct: { text: "Win %", tip: "Share of games won by decks that mainboarded this card. Always unreliable: at this many games a single card's win rate is mostly luck, and it doesn't repeat between halves of the drafts. Hover for the record." },
    pickElo: { text: "Pick ELO", tip: "A chess-style rating starting at 1200. It rises each time a deck plays this card over a card of the same colors it left in the sideboard, so it measures what drafters choose." },
    lastPlayed: { text: "Last played", tip: "Date of the draft this card was last mainboarded." },
    words: { text: "Words", tip: "Words in the card's oracle text, excluding reminder text." },
    tags: { text: "# Tags", tip: "Number of unique tags on decks that have mainboarded this card." },
    players: { text: "# Players", tip: "Number of unique players who have mainboarded this card." },

    playedByTitle: "Played by",
    deckLinkTip: "Open decks that mainboarded this card (same filters & time range)",

    mainboarded: "Mainboarded",
    sideboarded: "Sideboarded",
    playableSideboard: "Playable sideboard",

    record: "Record",
    winPercent: "Win %",
  },

  // CardTooltip.js: the tables in the card name popover.
  tooltip: {
    player: "Player",
    mainboardCount: "Played",
    sideboardCount: "Sideboarded",
    archetype: "Archetype",
  },

  // CardScatter.js and scatterAxes.js: the axis labels (values are fixed in code),
  // the chart's labels, and its hover text.
  scatter: {
    axisNumDecks: "# Decks",
    axisNumSideboard: "# Sideboard",
    axisPopularity: "Popularity",
    axisWinPercent: "Win %",
    axisWinPercentVsAvg: "Win % vs avg",
    axisPercentOfWins: "% of Wins",
    axisNumWins: "# Wins",
    axisPickElo: "Pick ELO",
    axisNumGames: "# Games",
    axisManaValue: "Mana Value",
    axisNumPlayers: "# Players",
    axisDraftPick: "Avg. draft pick",
    axisNumTrophies: "# Trophies",
    axisNumLastPlace: "# Last place",
    axisWordCount: "Word Count",

    allCardsLabel: "All cards",
    cubeAverageLabel: "Cube average",
    xAxisLabel: "X Axis",
    yAxisLabel: "Y Axis",
    title: ({ y, x }) => `${y} vs. ${x} (all drafts)`,
    pointLabel: ({ card, x, xValue, y, yValue }) => `${card}: ${x} ${xValue}, ${y} ${yValue}`,
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
