// All the text the Rules editor page shows, in one place so it can be edited
// without touching component code. One key per component file; text with values
// in it is a function that takes named values and returns the whole sentence.

export const RULES_COPY = {
  // EditorToolbar.js: the page title, the view switch, and the read-only notice.
  toolbar: {
    title: "Rules editor",
    readOnly: "This cube is read-only",
    viewsLabel: "Rules editor view",
    overview: "Overview",
    audit: "Audit",
    review: "Review",
    compare: "Compare",
  },

  // RulesEditorPage.js: the loading text and the messages shown after a bad save.
  page: {
    loading: "Loading design map…",
    conditionRequired: "At least one condition is required.",
    wireNeedsEnds: "Every wire needs at least one source and one target group.",
  },

  // Overview.js: the resting pane.
  overview: {
    heading: "Design Editor",
    lede: [
      "The rulebook behind the synergy map: ",
      { bold: "groups" },
      " are card sets defined by query conditions, ",
      { bold: "links" },
      " wire groups together. Pick one on the left, or search a card on the right to see where it sits.",
    ],
    vitalCards: "cards",
    vitalGroups: "groups",
    vitalLinks: "links",
    vitalEdges: "card edges",
    coverageHeading: "Group coverage",
    coverageMeasuring: "measuring…",
    coverage: ({ grouped, total, pct }) => `${grouped} of ${total} cards in at least one group (${pct}%)`,
    healthHeading: "Health",
    healthOk: "✓ No structural issues — every group matches cards and is wired to a link.",
    healthIssues: (count) => `${count} structural issue${count === 1 ? "" : "s"} — open the audit board`,
  },

  // AuditBoard.js: the audit board's sections and the lines under them.
  audit: {
    heading: "Audit",
    noIssues: "no structural issues",
    issues: (count) => `${count} structural issue${count === 1 ? "" : "s"}`,
    reviewCtaBold: "Card-by-card review",
    reviewCtaBefore: " — step through every card with ",
    reviewCtaAfter: " and check its groups",
    coverageDivider: "Coverage — worth a look, not necessarily wrong",
    measuring: "Measuring memberships…",

    emptyGroupsTitle: "Empty groups",
    emptyGroupsBlurb: "Conditions match no cards — a stale query or a card that left the cube.",
    emptyGroupsOk: "Every group matches at least one card.",

    unlinkedGroupsTitle: "Unlinked groups",
    unlinkedGroupsBlurb: "No link references these groups, so membership does nothing yet.",
    unlinkedGroupsOk: "Every group is wired into at least one link.",

    brokenLinksTitle: "Broken links",
    brokenLinksBlurb: "A wire names a group that doesn't exist, or one side of a wire is empty.",
    brokenLinksOk: "Every wire has valid sources and targets.",
    missingSub: (names) => `missing: ${names}`,
    emptyWireSide: "empty wire side",

    staleExcludesTitle: "Stale excludes",
    staleExcludesBlurb: "A group excludes a card name that isn't in the cube — a typo, or a card that was renamed or cut.",
    staleExcludesOk: "Every excluded card name exists in the cube.",
    excludesSub: (name) => `excludes: ${name}`,

    doubledLinksTitle: "Doubled-up links",
    doubledLinksBlurb: "More than one link wires the same pair of groups — the edges are identical, so one rule may be redundant.",
    doubledLinksOk: "No two links wire the same pair of groups.",

    similarGroupsTitle: "Near-identical groups",
    similarGroupsBlurb: "Two groups whose members mostly coincide — likely the same idea captured twice.",
    similarGroupsOk: "No two groups share most of their members.",
    sameAsSub: ({ pct, other }) => `${pct}% same as ${other}`,

    ungroupedCardsTitle: "Ungrouped cards",
    ungroupedCardsBlurb: "In no group at all — invisible to the synergy map.",
    ungroupedCardsOk: "Every card is in at least one group.",

    isolatedCardsTitle: "Isolated cards",
    isolatedCardsBlurb: "Grouped, but with zero edges — all of their groups are unlinked.",
    isolatedCardsOk: "Every grouped card has at least one edge.",
  },

  // rulebookAudit.js: the warnings shown on a group or link in the registry and its pane.
  rulebookAudit: {
    groupEmpty: "Matches no cards",
    groupUnlinked: "No link uses this group",
    staleExcludes: ({ count, names }) => `Excludes unknown card${count === 1 ? "" : "s"}: ${names}`,
    linkMissing: (names) => `References missing group/card: ${names}`,
    linkOneSided: "A wire is missing a source or target",
  },

  // Registry.js: the left rail's filter, headings, and empty lists.
  registry: {
    filterPlaceholder: "Filter groups & links…",
    filterLabel: "Filter groups and links",
    groupsHeading: "Groups",
    linksHeading: "Links",
    newGroup: "New group",
    newLink: "New link",
    noGroups: "No groups match.",
    noLinks: "No links match.",
  },

  // CardLens.js: the right rail's card search, memberships, and linked cards.
  cardLens: {
    searchPlaceholder: "Search a card…",
    searchPrompt: "Search a card to inspect its groups and links.",
    inGroups: (count) => `In groups ${count ? `(${count})` : ""}`,
    measuring: "Measuring…",
    notInAnyGroup: "Not in any group.",
    compareHeading: "Compare",
    comparePlaceholder: "Compare with another card…",
    viewLinksBetween: "View links between ⇄",
    linkedCards: (count) => `Linked cards ${count ? `(${count})` : ""}`,
    noLinks: "No links from this card.",
    unlabeled: "(unlabeled)",
    compareWithThisCard: "Compare with this card",
  },

  // CompareDetail.js: the pane comparing two cards.
  compare: {
    heading: "Compare",
    linkCount: (count) => `${count} link${count === 1 ? "" : "s"} between`,
    swap: "⇄ Swap",
    clear: "Clear",
    noLinks: "No links between these two cards.",
    editLink: "edit ▸",
    direct: "direct",
  },

  // GroupDetail.js: the pane for one group.
  group: {
    cardCount: (count) => `${count} card${count === 1 ? "" : "s"}`,
    excludedCount: (count) => ` · ${count} excluded`,
    matchesAnyOf: "Matches any of",
    wiredInto: (count) => `Wired into ${count ? `(${count})` : ""}`,
    noLinks: "No links use this group — its cards get no edges from it.",
    membersHeading: "Members",
    noMembers: "No cards match these conditions.",
    openInLens: "Open in the card lens",
    excludeFromGroup: "Exclude from this group",
    excludedHeading: (count) => `Excluded (${count})`,
    excludedTag: "excluded",
    restoreToGroup: "Restore to this group",
  },

  // LinkDetail.js: the pane for one link.
  link: {
    subCard: "card",
    subMissingCard: "missing card",
    subMissingGroup: "missing group",
    subCardCount: (count) => `${count} cards`,
    edgeCount: (count) => `${count} card edge${count === 1 ? "" : "s"}`,
    sources: "Sources",
    targets: "Targets",
    note: "Within each wire, every card in a source group links to every card in a target group.",
  },

  // ReviewDetail.js: the card-by-card review pane.
  review: {
    heading: "Review",
    position: ({ number, total }) => `${number} of ${total}`,
    jumpPlaceholder: "Jump to card…",
    prev: "← Prev",
    next: "Next →",
    ungrouped: "⚠ In no groups — invisible to the synergy map.",
    isolated: "⚠ Grouped, but no edges — all of its groups are unlinked.",
    inGroups: (count) => `In groups ${count ? `(${count})` : ""}`,
    measuring: "Measuring…",
    linkedCards: (count) => `Linked cards ${count ? `(${count})` : ""}`,
    noLinks: "No links from this card.",
    unlabeled: "(unlabeled)",
    hintPrevious: " previous · ",
    hintNext: " next — position is saved in the URL, come back anytime.",
  },

  // rulesParts.js: the Edit and Delete buttons shared by the group and link panes.
  parts: {
    confirmDelete: "Confirm delete",
    keep: "Keep",
    edit: "Edit",
    delete: "Delete",
  },
}
