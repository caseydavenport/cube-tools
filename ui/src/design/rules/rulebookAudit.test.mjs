import { test } from "node:test"
import assert from "node:assert/strict"
import { auditRulebook, groupWarning, packageWarning } from "./rulebookAudit.js"

// RULEBOOK is a small rulebook with one of each problem the audit looks for:
// A and B hold the same cards, Empty matches nothing, Lonely is never wired,
// A excludes a card that isn't in the cube, and three packages are broken.
function rulebook({ membershipsLoading = false } = {}) {
  const groups = [
    { name: "A", conditions: ["t:a"], exclude: ["Ghost"] },
    { name: "B", conditions: ["t:b"] },
    { name: "Empty", conditions: ["t:none"] },
    { name: "Lonely", conditions: ["t:z"] },
  ]
  const packages = [
    { name: "L1", wires: [{ sources: ["A"], targets: ["B"] }] },
    { name: "L2", wires: [{ sources: ["A"], targets: ["B"] }] },
    { name: "Broken", wires: [{ sources: ["A"], targets: ["Missing"] }] },
    { name: "OneSided", wires: [{ sources: ["A"], targets: [] }] },
    { name: "Direct", wires: [{ sources: ["A"], targets: ["card:Nowhere"] }] },
  ]
  const groupCards = {
    A: { cards: ["x", "y"] },
    B: { cards: ["x", "y"] },
    Empty: { cards: [] },
    Lonely: { cards: ["z"] },
  }
  const cardGroups = {
    x: [{ group: "A" }, { group: "B" }],
    y: [{ group: "A" }, { group: "B" }],
    z: [{ group: "Lonely" }],
  }
  const neighborsOf = {
    x: [{ name: "y", packages: ["L1"] }],
    y: [{ name: "x", packages: ["L1"] }],
  }
  return {
    packages, groups, groupNames: groups.map(g => g.name), groupCards,
    names: ["x", "y", "z"], cardGroups, membershipsLoading, neighborsOf,
  }
}

test("flags packages naming a missing group or card", () => {
  const audit = auditRulebook(rulebook())
  assert.deepEqual(audit.brokenPackages.map(b => b.name), ["Broken", "OneSided", "Direct"])
  assert.deepEqual(audit.brokenPackages[0].missing, ["Missing"])
})

test("flags group pairs wired twice", () => {
  const audit = auditRulebook(rulebook())
  assert.equal(audit.duplicatePairs.length, 1)
  assert.equal(audit.duplicatePairs[0].key, "A|B")
  assert.deepEqual(audit.duplicatePairs[0].names, ["L1", "L2"])
})

test("flags groups with nearly the same members", () => {
  assert.deepEqual(auditRulebook(rulebook()).similarGroups, [{ a: "A", b: "B", shared: 2, pct: 100 }])
})

test("lists empty and unlinked groups", () => {
  const audit = auditRulebook(rulebook())
  assert.deepEqual(audit.emptyGroups, ["Empty"])
  assert.deepEqual(audit.unlinkedGroups, ["Empty", "Lonely"])
})

test("flags excludes naming cards not in the cube", () => {
  assert.deepEqual(auditRulebook(rulebook()).staleExcludes, [{ group: "A", name: "Ghost" }])
})

test("card lists wait for memberships", () => {
  const audit = auditRulebook(rulebook({ membershipsLoading: true }))
  assert.equal(audit.ungroupedCards, null)
  assert.equal(audit.isolatedCards, null)
})

test("isolated cards are grouped but have no edges", () => {
  assert.deepEqual(auditRulebook(rulebook()).isolatedCards, ["z"])
})

test("structural counts broken, unlinked, empty and stale", () => {
  assert.equal(auditRulebook(rulebook()).structural, 3 + 2 + 1 + 1)
})

test("group warning joins its problems", () => {
  assert.equal(groupWarning(auditRulebook(rulebook()), "Empty"), "Matches no cards; No package uses this group")
})

test("package warning names what's missing", () => {
  assert.equal(packageWarning(auditRulebook(rulebook()), "Broken"), "References missing group/card: Missing")
})
