import { test } from "node:test"
import assert from "node:assert/strict"
import { auditRulebook, groupWarning, linkWarning } from "./rulebookAudit.js"

// RULEBOOK is a small rulebook with one of each problem the audit looks for:
// A and B hold the same cards, Empty matches nothing, Lonely is never wired,
// A excludes a card that isn't in the cube, and three links are broken.
function rulebook({ membershipsLoading = false } = {}) {
  const groups = [
    { name: "A", conditions: ["t:a"], exclude: ["Ghost"] },
    { name: "B", conditions: ["t:b"] },
    { name: "Empty", conditions: ["t:none"] },
    { name: "Lonely", conditions: ["t:z"] },
  ]
  const links = [
    { label: "L1", wires: [{ sources: ["A"], targets: ["B"] }] },
    { label: "L2", wires: [{ sources: ["A"], targets: ["B"] }] },
    { label: "Broken", wires: [{ sources: ["A"], targets: ["Missing"] }] },
    { label: "OneSided", wires: [{ sources: ["A"], targets: [] }] },
    { label: "Direct", wires: [{ sources: ["A"], targets: ["card:Nowhere"] }] },
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
    x: [{ name: "y", labels: ["L1"] }],
    y: [{ name: "x", labels: ["L1"] }],
  }
  return {
    links, groups, groupNames: groups.map(g => g.name), groupCards,
    names: ["x", "y", "z"], cardGroups, membershipsLoading, neighborsOf,
  }
}

test("flags links naming a missing group or card", () => {
  const audit = auditRulebook(rulebook())
  assert.deepEqual(audit.brokenLinks.map(b => b.label), ["Broken", "OneSided", "Direct"])
  assert.deepEqual(audit.brokenLinks[0].missing, ["Missing"])
})

test("flags group pairs wired twice", () => {
  const audit = auditRulebook(rulebook())
  assert.equal(audit.duplicatePairs.length, 1)
  assert.equal(audit.duplicatePairs[0].key, "A|B")
  assert.deepEqual(audit.duplicatePairs[0].labels, ["L1", "L2"])
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
  assert.equal(groupWarning(auditRulebook(rulebook()), "Empty"), "Matches no cards; No link uses this group")
})

test("link warning names what's missing", () => {
  assert.equal(linkWarning(auditRulebook(rulebook()), "Broken"), "References missing group/card: Missing")
})
