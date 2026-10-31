// All the text the Synergy map page shows, in one place so it can be edited
// without touching component code. One key per component file; text with values
// in it is a function that takes named values and returns the whole sentence.

export const MAP_COPY = {
  // CardSynergyMap.js: the deck's card graph and its side panels.
  cardSynergyMap: {
    noCards: "No cards to map.",
    colorBy: "Color by",
    colorByIdentity: "Identity",
    colorByCommunity: "Community",
    caption: ({ cards, links, clusters }) => `${cards} cards · ${links} connections · ${clusters} clusters · hover to trace, click to pin`,
    mostConnected: "Most connected",
    noConnectedCards: "No connected cards.",
    communities: "Communities",
    noClusters: "No clusters.",
    mixedCommunity: "mixed",
    openInEditor: "Open in the design editor",
    noConnectionsInPool: "No connections in this pool.",
    connectedTo: "Connected to",
  },

  // designData.js: messages from saving the rules.
  designData: {
    saveFailed: ({ reason }) => `Save failed: ${reason}`,
  },

  // DrillMap.js: the captions under the graph and the why-connected tooltip.
  drillMap: {
    captionThemesAndCards: ({ themes, cards }) => `${themes} themes + ${cards} cards · click to drill in`,
    captionThemes: ({ themes }) => `${themes} themes · click to drill in`,
    captionGroup: ({ cards, group }) => `${cards} cards in ${group} · click a card`,
    captionCard: ({ cards, card }) => `${cards} cards connected to ${card}`,
    nodeLabelWithCount: ({ label, count }) => `${label} (${count})`,
    sharedRule: "shared rule",
    between: "⇄",
    packageCount: ({ count }) => (count === 1 ? "1 package" : `${count} packages`),
    cardGroups: ({ card }) => `${card}'s groups`,
  },

  // GroupEditModal.js: the group dialog and its query reference.
  groupEdit: {
    queryReference: "Query Reference",
    queryName: "name",
    queryOracle: "oracle text",
    queryType: "type",
    querySubtype: "subtype",
    queryColor: "color (WUBRG)",
    queryManaCost: "mana cost",
    queryManaValue: "mana value",
    queryKeyword: "keyword",
    queryTag: "Scryfall tag",
    comparisons: "Comparisons",
    //   is a non-breaking space, as the &nbsp; it replaces.
    comparisonsCmc: "cmc<=N   cmc>=N",
    comparisonsPowTou: "pow<=N   tou>=N",
    isKeywords: "is: keywords",
    keywordsLine1: "creature, land,",
    keywordsLine2: "removal, counterspell,",
    keywordsLine3: "interaction, handhate",
    operators: "Operators",
    operatorNegate: "negate",
    operatorOr: "disjunction",
    operatorGrouping: "grouping",
    operatorQuote: "quoted phrase",
    operatorWildcard: "wildcard",
    editGroup: "Edit Group",
    nameLabel: "Name",
    namePlaceholder: "e.g. Mill Enablers",
    conditionsLabel: "Conditions",
    conditionsPlaceholder: "e.g. o:mill",
    save: "Save",
    cancel: "Cancel",
    matchingCards: "Matching Cards",
    excludedCount: ({ count }) => ` · ${count} excluded`,
    noMatchingCards: "No matching cards.",
    excludedTag: "excluded",
    restoreToGroup: "Restore to group",
    excludeFromGroup: "Exclude from group",
  },

  // PackageEditModal.js: the package dialog and its source and target card lists.
  packageEdit: {
    noMatchingCards: "No matching cards.",
    sourceCards: "Source Cards",
    sourceCardsWire: ({ wire }) => `Source Cards · Wire ${wire}`,
    targetCards: "Target Cards",
    targetCardsWire: ({ wire }) => `Target Cards · Wire ${wire}`,
    editPackage: "Edit package",
    nameLabel: "Name",
    namePlaceholder: "e.g. Delve",
    wireTitle: ({ wire }) => `Wire ${wire}`,
    removeWire: "Remove wire",
    sourcesLabel: "Sources",
    targetsLabel: "Targets",
    addWire: "Add wire",
    save: "Save",
    cancel: "Cancel",
  },

  // RuleInputs.js: the inputs the group and package dialogs share.
  ruleInputs: {
    selectGroupOrCard: "-- Select group or card --",
    selectGroup: "-- Select group --",
    groupsOption: "Groups",
    cardsOption: "Cards",
    editGroup: "Edit group",
    remove: "Remove",
    addGroup: "Add group",
    matchedConditions: "Matched Conditions",
    orSuffix: "(OR)",
    removeClause: "Remove clause",
    addOrClause: "Add OR clause",
    excludeCards: "Exclude cards",
    excludeCardLabel: "Exclude card",
    selectCard: "-- Select card --",
    removeExclusion: "Remove exclusion",
    excludeACard: "Exclude a card",
  },
}
