import { test } from "node:test"
import assert from "node:assert/strict"
import { auditRulebook, groupWarning, packageWarning } from "./rulebookAudit.js"

// rulebook is a small rulebook with one of each broken rule the audit looks
// for: Empty matches nothing, A excludes a card that isn't in the cube, and
// three packages are broken.
function rulebook() {
  const groups = [
    { name: "A", conditions: ["t:a"], exclude: ["Ghost"] },
    { name: "B", conditions: ["t:b"] },
    { name: "Empty", conditions: ["t:none"] },
  ]
  const packages = [
    { name: "L1", wires: [{ sources: ["A"], targets: ["B"] }] },
    { name: "Broken", wires: [{ sources: ["A"], targets: ["Missing"] }] },
    { name: "OneSided", wires: [{ sources: ["A"], targets: [] }] },
    { name: "Direct", wires: [{ sources: ["A"], targets: ["card:Nowhere"] }] },
  ]
  const groupCards = {
    A: { cards: ["x", "y"] },
    B: { cards: ["x", "y"] },
    Empty: { cards: [] },
  }
  return { packages, groups, groupNames: groups.map(g => g.name), groupCards, names: ["x", "y"] }
}

test("the audit returns only broken-rule lists", () => {
  assert.deepEqual(Object.keys(auditRulebook(rulebook())).sort(), ["brokenPackages", "emptyGroups", "staleExcludes"])
})

test("flags packages naming a missing group or card", () => {
  const audit = auditRulebook(rulebook())
  assert.deepEqual(audit.brokenPackages.map(b => b.name), ["Broken", "OneSided", "Direct"])
  assert.deepEqual(audit.brokenPackages[0].missing, ["Missing"])
})

test("lists empty groups", () => {
  assert.deepEqual(auditRulebook(rulebook()).emptyGroups, ["Empty"])
})

test("flags excludes naming cards not in the cube", () => {
  assert.deepEqual(auditRulebook(rulebook()).staleExcludes, [{ group: "A", name: "Ghost" }])
})

test("group warning names what's broken", () => {
  assert.equal(groupWarning(auditRulebook(rulebook()), "Empty"), "Matches no cards")
})

test("package warning names what's missing", () => {
  assert.equal(packageWarning(auditRulebook(rulebook()), "Broken"), "References missing group/card: Missing")
})
