// All the text the Synergy page shows, in one place so it can be edited without
// touching component code. One key per component file; text with values in it
// is a function that takes named values and returns the whole sentence.

export const SYNERGY_COPY = {
  // SynergyWidget.js: the option bar, its hover tips, and the table section titles.
  widget: {
    pairsTitle: "Synergistic Pairs",
    focalPointsTitle: "Archetype Focal Points",
    showingPairs: ({ count }) => `Showing top ${count} synergistic pairs`,

    minDecksHeader: "Min Decks",
    minDecksTip: "Minimum co-occurrences to include a pair.",
    minDecksLabel: "Min decks",

    focalThresholdHeader: "Focal Threshold",
    focalThresholdTip: "Min synergy score for a partner to count toward focal score.",
    focalThresholdLabel: "Focal threshold",

    smoothingHeader: "Smoothing K",
    smoothingTip: "Dampens noisy scores from low-sample pairs. Higher K = more conservative. 0 = no smoothing.",
    smoothingLabel: "Smoothing K",

    colorAdjustHeader: "Color Adjust",
    colorAdjustTip: "Adjust expected co-occurrence for color bias. When on, same-color pairs are compared against decks that could cast both cards, preventing inflated scores.",
    colorAdjustLabel: "Color adjust",

    recordHeader: "Deck Record",
    recordTip: "Restrict the source decks by match record. 'Winning' keeps decks that went 2-1 or better, 'losing' keeps 1-2 or worse. Compare the two to see which cards rise or fall between winning and losing decks.",
    recordLabel: "Record",
    recordAll: "All decks",
    recordWinning: "Winning (2-1+)",
    recordLosing: "Losing (1-2-)",
  },

  // SynergyTables.js: the column headers and their hover tips.
  tables: {
    pairCard1: "Card 1",
    pairCard1Tip: "First card in pair.",
    pairCard2: "Card 2",
    pairCard2Tip: "Second card in pair.",
    pairWinPercent: "Win %",
    pairWinPercentTip: "Aggregate win % of decks with both.",
    pairCount: "#",
    pairCountTip: "Number of decks.",
    pairSynergy: "Syn",
    pairSynergyTip: "Lift score. >1 = appears together more than expected.",
    pairSaturation: "Sat",
    pairSaturationTip: "Realized fraction: how many of the rarer card's decks this pair filled (count / min plays of the two cards). High = the pair is near its co-occurrence ceiling; low = headroom left.",

    liftSuffix: "x",

    focalCard: "Card",
    focalCardTip: "Card Name",
    focalScore: "Score",
    focalScoreTip: "Sum of synergy scores for partners above the focal threshold. High = build-around card.",
    focalPartners: "Top Partners",
    focalPartnersTip: "Cards that most frequently appear with this card.",
  },

  // SynergyHub.js: the two hub-vs-support charts and the card detail panel between them.
  hub: {
    colorAll: "All colors",
    colorWhite: "White",
    colorBlue: "Blue",
    colorBlack: "Black",
    colorRed: "Red",
    colorGreen: "Green",
    colorMulticolor: "Multicolor",
    colorColorless: "Colorless",

    title: "Synergy Hub vs Support",
    description: "Breadth (x, total synergy across all partners divided by the decks the card appeared in, so play count doesn't inflate it) vs depth (y, strongest single pair). Bottom-right = support glue (broad, no strong pair), top-right = true hub (broad and deep), top-left = niche build-around (one intense pair), bottom-left = incidental. Crosshairs mark the medians; click a point to see its details between the charts. Pick a color per chart to compare the shape of one color against another.",

    detailHint: "Click a point for card details.",
    detailBreadth: "Breadth / deck (x)",
    detailPeak: "Peak synergy (y)",
    detailFocalScore: "Focal score",
    detailDecks: "Decks",
    detailTopPartners: "Top partners",
    detailTopPartnersKey: "(lift · saturation)",
    detailNoPartners: "None above threshold",
    detailPeakValue: ({ peak, saturation, peakWith }) => `${peak}x · ${saturation}${peakWith}`,
    detailPeakWith: ({ partner }) => ` (${partner})`,
    detailPartnerLift: ({ lift }) => `${lift}x`,
    detailPartnerSaturation: ({ saturation }) => ` · ${saturation}`,

    datasetLabel: "Cards",
    xAxisTitle: "Synergy breadth per deck",
    yAxisTitle: "Peak partner synergy (depth)",
    tooltipPeakWith: ({ partner }) => ` with ${partner}`,
    tooltipLabel: ({ name, breadth, focal, decks, peak, peakWith }) => `${name}: ${breadth} breadth/deck (focal ${focal} over ${decks} decks), peak ${peak}x${peakWith}`,

    colorDropdownLabel: "Color",
    noCards: "No cards in this color.",
  },

  // SynergyScatter.js: the popularity-vs-synergy chart.
  scatter: {
    title: "Popularity vs Synergy",
    fallbackIntro: ({ shown, above, total, floor }) => `Top ${shown} by synergy intensity (only ${above} of ${total} clear the noise floor, avg lift ≥ ${floor}); hollow points sit below it. `,
    normalIntro: ({ above, total, floor }) => `${above} of ${total} cards clear this pool's noise floor (avg lift ≥ ${floor}). `,
    description: "Play rate (x) vs average partner lift (y, synergy per partner), colored by identity. Both are shrunk toward the field average so tiny samples don't sit at the extremes (hover for raw). Left = niche build-arounds, right = archetype cores. Crosshairs mark the medians; click a point to select.",

    datasetLabel: "Cards",
    xAxisTitle: "Play rate (% of drafts opened, shrunk)",
    yAxisTitle: "Avg partner lift (synergy intensity, shrunk)",
    tooltipBelowFloor: " [below noise floor]",
    tooltipLabel: ({ name, flag, played, opened, rawRate, adjRate, rawLift, adjLift, focal }) => `${name}${flag}: maindecked ${played}/${opened} drafts opened (${rawRate}% raw, ${adjRate}% adj), avg lift ${rawLift} raw / ${adjLift} adj, focal ${focal}`,
  },

  // SynergyNetworkGraph.js: the network graph's title, description and hover label.
  networkGraph: {
    title: "Synergy Network Graph",
    // The description is one sentence run split around two colored spans.
    descriptionStart: "Node size = focal score (breadth), color = identity, ",
    descriptionGoldRing: "gold ring",
    descriptionMiddle: " = peak pair (depth). A big ring-less node is support glue, not a hub. ",
    descriptionGrayNodes: "Gray nodes",
    descriptionEnd: " are below-cut partners pulled in so their hubs aren't left floating. Links scale with synergy. Hover to name, click to select, drag to move.",
    hoverTag: ({ focal, peak }) => `  (focal ${focal}, peak ${peak}x)`,
  },

  // SynergyFocalCompare.js: the winning-vs-losing focal chart and table.
  focalCompare: {
    title: "Focal Score: Winning vs Losing",
    description: "Each card's focal score (hub strength) in winning vs losing decks. Above the diagonal = bigger hub when winning, below = when losing. A point on an axis formed no synergy in that pool (itself signal), not absent from it. Sliced pools score lower, so drop the synergy min-decks slider to fill the comparison in. Hover for deck counts; click a card to select.",

    datasetLabel: "Cards",
    xAxisTitle: "Focal score in losing decks",
    yAxisTitle: "Focal score in winning decks",
    tooltipWinning: "winning",
    tooltipLosing: "losing",
    tooltipEven: "even",
    tooltipLabel: ({ name, win, winDecks, lose, loseDecks, sign, delta, dir }) => `${name}: focal ${win} winning (${winDecks} decks) / ${lose} losing (${loseDecks} decks), Δ ${sign}${delta} leans ${dir}`,

    tableTitle: "Winning vs Losing Focal",
    headerCard: "Card",
    headerWinning: "Winning",
    headerLosing: "Losing",
    headerDelta: "Δ (W-L)",
    headerWinningTip: "The card's focal score (hub strength) in winning decks only.",
    headerLosingTip: "The card's focal score (hub strength) in losing decks only.",
    headerDeltaTip: "Winning focal score minus losing focal score. Positive means the card is a bigger hub in winning decks.",
  },
}
