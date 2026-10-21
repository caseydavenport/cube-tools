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
    caption: ({ cards, links, clusters, q }) => `${cards} cards · ${links} links · ${clusters} clusters (Q ${q}) · hover to trace, click to pin`,
    mostLinked: "Most linked",
    noLinkedCards: "No linked cards.",
    communities: "Communities",
    noClusters: "No clusters.",
    mixedCommunity: "mixed",
    openInEditor: "Open in the design editor",
    noLinksInPool: "No links in this pool.",
    linkedWith: "Linked with",
    compareInEditor: ({ card }) => `Compare with ${card} in the editor`,
  },

  // designData.js: messages from saving the rules.
  designData: {
    saveFailed: ({ reason }) => `Save failed: ${reason}`,
  },

  // DesignMapWidget.js: the empty state, breadcrumb, and themes legend.
  widget: {
    emptyTitle: "No design map yet.",
    emptyHintBefore: "Use the ",
    emptyHintLink: "Rules editor",
    emptyHintAfter: " to define groups (card queries) and links (how groups relate). The map is built from those rules.",
    allThemes: "All themes",
    mapLocation: "Map location",
    themesHeading: "Themes",
    filterPlaceholder: "Filter themes…",
    filterLabel: "Filter themes",
    sortLabel: "Sort themes",
    sortSize: "Size",
    sortName: "A–Z",
    noThemesMatch: "No themes match.",
  },

  // DrillMap.js: the captions under the graph and the why-linked tooltip.
  drillMap: {
    captionThemesAndCards: ({ themes, cards }) => `${themes} themes + ${cards} cards · click to drill in`,
    captionThemes: ({ themes }) => `${themes} themes · click to drill in`,
    captionGroup: ({ cards, group }) => `${cards} cards in ${group} · click a card`,
    captionCard: ({ cards, card }) => `${cards} cards linked to ${card}`,
    sharedRule: "shared rule",
    between: "⇄",
    linkCount: ({ count }) => (count === 1 ? "1 link" : `${count} links`),
    cardGroups: ({ card }) => `${card}'s groups`,
  },

  // ForceGraph.js: a theme's label on the canvas.
  forceGraph: {
    nodeLabelWithCount: ({ label, count }) => `${label} (${count})`,
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

  // LinkEditModal.js: the link dialog and its source and target card lists.
  linkEdit: {
    noMatchingCards: "No matching cards.",
    sourceCards: "Source Cards",
    sourceCardsWire: ({ wire }) => `Source Cards · Wire ${wire}`,
    targetCards: "Target Cards",
    targetCardsWire: ({ wire }) => `Target Cards · Wire ${wire}`,
    editLink: "Edit Link",
    labelLabel: "Label",
    labelPlaceholder: "e.g. Delve",
    wireTitle: ({ wire }) => `Wire ${wire}`,
    removeWire: "Remove wire",
    sourcesLabel: "Sources",
    targetsLabel: "Targets",
    addWire: "Add wire",
    save: "Save",
    cancel: "Cancel",
  },

  // MapDetails.js: the detail panel for the overview, a group, and a card.
  details: {
    overview: "Overview",
    statThemes: "Themes",
    statLinks: "Links",
    statCards: "Cards",
    statUnlinked: "Unlinked",
    drillHint: "Click a theme in the map or legend to drill in.",
    largestThemes: "Largest themes",
    linksTo: "Links to",
    viaLabels: ({ labels }) => `via ${labels}`,
    cardsHeading: "Cards",
    hoverForWhy: "hover a card for why it matched",
    inThemes: "In themes",
    cardMv: ({ cmc }) => ` · ${cmc} MV`,
    linkedCards: "Linked cards",
    unlabeledRule: "(unlabeled)",
    noLinksFromCard: "No links from this card.",
  },

  // RuleInputs.js: the inputs the group and link dialogs share.
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
