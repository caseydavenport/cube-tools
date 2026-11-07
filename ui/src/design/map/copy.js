// The text the deck map and the rules dialogs show, in one place so it can be edited
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
    openInEditor: "Find its packages in the Rules editor",
    noConnectionsInPool: "No connections in this pool.",
    connectedTo: "Connected to",
  },

  // designData.js: messages from saving the rules.
  designData: {
    saveFailed: ({ reason }) => `Save failed: ${reason}`,
  },

  // GroupEditModal.js: the group dialog and its query reference.
  groupEdit: {
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

  // PackageEditModal.js: the package dialog and the card lists for each wire side.
  packageEdit: {
    noMatchingCards: "No matching cards.",
    editPackage: "Edit package",
    nameLabel: "Name",
    namePlaceholder: "e.g. Delve",
    wireTitle: ({ wire }) => `Wire ${wire}`,
    removeWire: "Remove wire",
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
