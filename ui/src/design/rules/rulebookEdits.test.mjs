import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanGroup, renameInPackage, withCardExcluded, withExclude, withGroup, withPackage, withWireAdded, withWireRemoved } from "./rulebookEdits.js"

test("withExclude drops an empty exclude list", () => {
  const group = withExclude({ name: "A", conditions: ["t:a"], exclude: ["x"] }, [])
  assert.equal("exclude" in group, false)
})

test("withExclude sets a non-empty exclude list", () => {
  assert.deepEqual(withExclude({ name: "A" }, ["x"]).exclude, ["x"])
})

test("renameInLink renames every wire end", () => {
  const pkg = { name: "L", wires: [{ sources: ["Old", "B"], targets: ["Old"] }] }
  assert.deepEqual(renameInPackage(pkg, "Old", "New").wires, [{ sources: ["New", "B"], targets: ["New"] }])
})

test("cleanGroup trims what the editor leaves blank", () => {
  const group = cleanGroup({ name: "  ", conditions: [" o:x ", ""], exclude: ["", "Shock"] })
  assert.deepEqual(group, { name: "Untitled group", conditions: ["o:x"], exclude: ["Shock"] })
})

test("cleanGroup is null with no condition left", () => {
  assert.equal(cleanGroup({ name: "A", conditions: [" ", ""], exclude: [] }), null)
})

// rules is a small rule set where Fodder sits in two packages.
function rules() {
  return {
    groups: [{ name: "Outlets", conditions: ["o:a"] }, { name: "Fodder", conditions: ["o:b"] }],
    packages: [
      { name: "Sacrifice", wires: [{ sources: ["Outlets"], targets: ["Fodder"] }] },
      { name: "Burn", wires: [{ sources: ["Fodder"], targets: ["card:Lightning Bolt"] }] },
    ],
  }
}

test("withGroup renames a group everywhere and leaves its input alone", () => {
  const config = rules()
  const before = structuredClone(config)
  const next = withGroup(config, "Fodder", { name: "Chaff", conditions: ["o:c"] })
  assert.deepEqual(next.groups[1], { name: "Chaff", conditions: ["o:c"] })
  assert.deepEqual(next.packages[0].wires[0].targets, ["Chaff"])
  assert.deepEqual(next.packages[1].wires[0].sources, ["Chaff"])
  assert.deepEqual(config, before)
})

test("withGroup with no original name adds the group", () => {
  const next = withGroup(rules(), "", { name: "New", conditions: ["o:n"] })
  assert.deepEqual(next.groups.map(g => g.name), ["Outlets", "Fodder", "New"])
})

test("withPackage replaces a package by its original name", () => {
  const pkg = { name: "Burn 2", wires: [{ sources: ["Outlets"], targets: ["Fodder"] }] }
  const next = withPackage(rules(), "Burn", pkg)
  assert.deepEqual(next.packages.map(p => p.name), ["Sacrifice", "Burn 2"])
  assert.deepEqual(next.packages[1], pkg)
})

test("withCardExcluded adds and removes one card from a group's exclude list", () => {
  const groups = [{ name: "A", conditions: ["t:a"], exclude: ["x"] }, { name: "B", conditions: ["t:b"] }]
  const added = withCardExcluded(groups, "A", "y", true)
  assert.deepEqual(added[0].exclude, ["x", "y"])
  assert.deepEqual(withCardExcluded(added, "A", "x", false)[0].exclude, ["y"])
  assert.equal("exclude" in withCardExcluded(groups, "A", "x", false)[0], false)
  assert.deepEqual(groups[0].exclude, ["x"])
})

test("withWireAdded appends an Enables wire from the first group to the second, leaving its input alone", () => {
  const config = rules()
  const before = structuredClone(config)
  const next = withWireAdded(config, "Sacrifice", "Outlets", "Payoffs")
  assert.deepEqual(next.packages[0].wires[1], { kind: "enables", sources: ["Outlets"], targets: ["Payoffs"] })
  assert.equal(next.packages[0].wires.length, 2)
  assert.deepEqual(config, before)
})

test("withWireRemoved drops one wire, leaving its input alone", () => {
  const config = withWireAdded(rules(), "Sacrifice", "Outlets", "Payoffs")
  const before = structuredClone(config)
  const next = withWireRemoved(config, "Sacrifice", 0)
  assert.deepEqual(next.packages[0].wires, [{ kind: "enables", sources: ["Outlets"], targets: ["Payoffs"] }])
  assert.deepEqual(config, before)
})

test("renaming a group in a package keeps each wire's kind", () => {
  const pkg = { name: "Sacrifice", wires: [{ kind: "enables", sources: ["Outlets"], targets: ["Payoffs"] }] }
  const next = renameInPackage(pkg, "Outlets", "Sac outlets")
  assert.deepEqual(next.wires, [{ kind: "enables", sources: ["Sac outlets"], targets: ["Payoffs"] }])
})

test("cleanGroup keeps a group's build-around mark", () => {
  assert.equal(cleanGroup({ name: "Cheat", conditions: ["otag:x"], buildaround: true }).buildaround, true)
  assert.equal("buildaround" in cleanGroup({ name: "Plain", conditions: ["otag:x"] }), false)
})
