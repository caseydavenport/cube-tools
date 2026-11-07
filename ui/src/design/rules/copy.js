// All the text the Rules editor page shows, in one place so it can be edited
// without touching component code. One key per component file; text with values
// in it is a function that takes named values and returns the whole sentence.

export const RULES_COPY = {
  // RulesEditorPage.js: the loading text and the messages shown after a bad save.
  page: {
    loading: "Loading the rules…",
    conditionRequired: "At least one condition is required.",
    wireNeedsEnds: "Every wire needs a group on each side.",
  },

  // rulebookAudit.js: the warnings shown on a broken package or group.
  rulebookAudit: {
    groupEmpty: "Matches no cards",
    staleExcludes: ({ count, names }) => `Excludes unknown card${count === 1 ? "" : "s"}: ${names}`,
    packageMissing: (names) => `References missing group/card: ${names}`,
    packageOneSided: "A wire is missing a group on one side",
  },

  // ReviewDetail.js: the card-by-card review pane.
  review: {
    heading: "Review",
    position: ({ number, total }) => `${number} of ${total}`,
    jumpPlaceholder: "Jump to card…",
    prev: "← Prev",
    next: "Next →",
    ungrouped: "⚠ In no groups, so no package can use it.",
    isolated: "⚠ Grouped, but no edges. No package uses any of its groups.",
    inGroups: (count) => `In groups ${count ? `(${count})` : ""}`,
    measuring: "Measuring…",
    connectedCards: (count) => `Connected cards ${count ? `(${count})` : ""}`,
    noPackages: "No packages connect this card to another.",
    unlabeled: "(no package)",
    hintPrevious: " previous · ",
    hintNext: " next — position is saved in the URL, come back anytime.",
  },

  // rulesParts.js: the Edit and Delete buttons shared by the group and package views.
  parts: {
    confirmDelete: "Confirm delete",
    keep: "Keep",
    edit: "Edit",
    delete: "Delete",
  },
}
