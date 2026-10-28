// All the text the Deck stats page shows, in one place so it can be edited
// without touching component code. One key per component file; text with
// values in it is a function that takes named values and returns the whole
// sentence.

export const DECKSTATS_COPY = {
  // DeckWidget.js: the two chart pickers. The option labels are display text;
  // the option values the code switches on stay in the component.
  widget: {
    leftChartLabel: "Left Chart",
    rightChartLabel: "Right Chart",

    optionPieNumColors: "Pie: # Colors",
    optionDeckAvgMana: "Deck Avg. Mana Value",
    optionTotalBasics: "Avg. Basics per Deck",
    optionInteractionColor: "Interaction by Color",
    optionAvgRemoval: "Avg. Removal per-deck",
    optionAvgCounterspells: "Avg. Counterspells per-deck",
    optionSideboardSize: "Sideboard Size",
    optionRemovalManaCost: "Removal Mana Cost",
    optionAvgColorsTime: "Avg. # Colors over time",
    optionDeckScatter: "Deck Scatter Plot",

    titleInteractionColor: "Interaction by color",
    titleAvgRemoval: "Avg. removal per-deck",
    titleAvgCounterspells: "Avg. counterspells per-deck",
    titleRemovalManaCost: "Removal mana cost",
  },

  // DeckScatter.js and scatterAxes.js: the axis labels and the chart's labels.
  scatter: {
    axisInteraction: "# interaction",
    axisCreatures: "# creatures",
    axisWinPercent: "win %",
    axisAvgManaValue: "avg. mana value",

    xAxisLabel: "X Axis",
    yAxisLabel: "Y Axis",
    datasetLabel: "All decks",
    title: (yAxis, xAxis) => `${yAxis} vs. ${xAxis} (all drafts)`,
  },

  // DeckShapeCharts.js: chart titles and legend labels.
  shapeCharts: {
    manaValueSeries: "Average Mana Value",
    manaValueTitle: (bucketSize) => `Deck Avg. Mana Value (bucket size = ${bucketSize} drafts)`,

    plainsSeries: "Plains",
    islandsSeries: "Islands",
    swampsSeries: "Swamps",
    mountainsSeries: "Mountains",
    forestsSeries: "Forests",
    basicsTitle: (bucketSize) => `Avg. basics per deck (bucket size = ${bucketSize} drafts)`,

    sideboardSeries: "Avg. sideboard size",
    sideboardTitle: (bucketSize) => `Sideboard size (bucket size = ${bucketSize} drafts)`,

    numColorsSeries: "Avg. # colors",
    numColorsTitle: (bucketSize) => `# Colors per-deck (bucket size = ${bucketSize} drafts)`,

    pieTitle: "# Colors",
  },

  // OracleTextCharts.js: legend labels and the chart title suffix.
  oracleText: {
    whiteSeries: "W",
    blueSeries: "U",
    blackSeries: "B",
    redSeries: "R",
    greenSeries: "G",
    perDeckSeries: "Avg. per-deck",
    perSideboardSeries: "Avg. per-sideboard",
    inDeckSeries: "Avg. in-deck",
    inSideboardSeries: "Avg. in-sideboard",
    // The title the picker passes in, then the bucket size.
    titleWithBucketSize: (title, bucketSize) => `${title} (bucket size = ${bucketSize} drafts)`,
  },
}
