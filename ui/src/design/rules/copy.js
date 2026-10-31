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
    heading: "Rules editor",
    vitalCards: "cards",
    vitalGroups: "groups",
    vitalPackages: "packages",
    vitalEdges: "connected card pairs",
    coverageHeading: "Group coverage",
    coverageMeasuring: "measuring…",
    coverage: ({ grouped, total, pct }) => `${grouped} of ${total} cards in at least one group (${pct}%)`,
    healthHeading: "Structure",
    healthOk: "✓ No structural issues. Every group matches cards and is wired into a package.",
    healthIssues: (count) => `${count} structural issue${count === 1 ? "" : "s"} — open the audit board`,
  },

  // rulebookAudit.js: the warnings shown on a group or package in the registry and its pane.
  rulebookAudit: {
    groupEmpty: "Matches no cards",
    staleExcludes: ({ count, names }) => `Excludes unknown card${count === 1 ? "" : "s"}: ${names}`,
    packageMissing: (names) => `References missing group/card: ${names}`,
    packageOneSided: "A wire is missing a source or target",
  },

  // Registry.js: the left rail's filter, headings, and empty lists.
  registry: {
    filterPlaceholder: "Filter groups & packages…",
    filterLabel: "Filter groups and packages",
    groupsHeading: "Groups",
    packagesHeading: "Packages",
    newGroup: "New group",
    newPackage: "New package",
    noGroups: "No groups match.",
    noPackages: "No packages match.",
  },

  // CardLens.js: the right rail's card search, memberships, and connected cards.
  cardLens: {
    searchPlaceholder: "Search a card…",
    searchPrompt: "Search a card to inspect its groups and packages.",
    inGroups: (count) => `In groups ${count ? `(${count})` : ""}`,
    measuring: "Measuring…",
    notInAnyGroup: "Not in any group.",
    compareHeading: "Compare",
    comparePlaceholder: "Compare with another card…",
    viewPackagesBetween: "View packages between ⇄",
    connectedCards: (count) => `Connected cards ${count ? `(${count})` : ""}`,
    noPackages: "No packages connect this card to another.",
    unlabeled: "(no package)",
    compareWithThisCard: "Compare with this card",
  },

  // CompareDetail.js: the pane comparing two cards.
  compare: {
    heading: "Compare",
    packageCount: (count) => `${count} package${count === 1 ? "" : "s"} between`,
    swap: "⇄ Swap",
    clear: "Clear",
    noPackages: "No packages connect these two cards.",
    editPackage: "edit ▸",
    direct: "direct",
  },

  // ReviewDetail.js: the card-by-card review pane.
  review: {
    heading: "Review",
    position: ({ number, total }) => `${number} of ${total}`,
    jumpPlaceholder: "Jump to card…",
    prev: "← Prev",
    next: "Next →",
    ungrouped: "⚠ In no groups — invisible to the synergy map.",
    isolated: "⚠ Grouped, but no edges. No package uses any of its groups.",
    inGroups: (count) => `In groups ${count ? `(${count})` : ""}`,
    measuring: "Measuring…",
    connectedCards: (count) => `Connected cards ${count ? `(${count})` : ""}`,
    noPackages: "No packages connect this card to another.",
    unlabeled: "(no package)",
    hintPrevious: " previous · ",
    hintNext: " next — position is saved in the URL, come back anytime.",
  },

  // rulesParts.js: the Edit and Delete buttons shared by the group and package panes.
  parts: {
    confirmDelete: "Confirm delete",
    keep: "Keep",
    edit: "Edit",
    delete: "Delete",
  },
}
