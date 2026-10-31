import { test } from "node:test"
import assert from "node:assert/strict"
import { applyLink, linkOptions, usesText } from "./linkCheckModel.js"

// Where Sacs creatures and Self-sacs sit in the polyverse rules.
const sacsCreatures = [
  { package: "Graveyard", wire: 0, side: "targets" },
  { package: "Sacrifice", wire: 0, side: "sources" },
]
const selfSacs = [
  { package: "Graveyard", wire: 0, side: "targets" },
  { package: "Sacrifice", wire: 1, side: "sources" },
]

test("a group's uses read as its packages, once each", () => {
  assert.equal(usesText(sacsCreatures), "Graveyard · Sacrifice")
  assert.equal(usesText([{ package: "Sacrifice", wire: 0, side: "sources" }, { package: "Sacrifice", wire: 2, side: "targets" }]), "Sacrifice")
  assert.equal(usesText([]), "Not in a package")
})

test("options add one group to the other side of a wire holding the other", () => {
  const options = linkOptions("Sacs creatures", sacsCreatures, "Self-sacs", selfSacs)
  assert.deepEqual(options.map(o => [o.kind, o.package, o.wire, o.side, o.group]), [
    ["add-to-wire", "Sacrifice", 0, "targets", "Self-sacs"],
    ["add-to-wire", "Sacrifice", 1, "targets", "Sacs creatures"],
    ["new-wire", undefined, undefined, undefined, undefined],
    ["new-package", undefined, undefined, undefined, undefined],
  ])
  assert.equal(options[0].label, "Add Self-sacs to the other side of Sacrifice's wire with Sacs creatures")
})

test("groups that already link offer nothing", () => {
  const a = [{ package: "Sacrifice", wire: 0, side: "sources" }]
  const b = [{ package: "Sacrifice", wire: 0, side: "targets" }]
  assert.deepEqual(linkOptions("Sacs creatures", a, "Sacrifice Matters", b), [])
})

test("a group in no package still offers a new wire or package", () => {
  assert.deepEqual(linkOptions("Burn", [], "Self-sacs", []).map(o => o.kind), ["new-wire", "new-package"])
})

// rules is a small rule set to edit.
function rules() {
  return {
    groups: [{ name: "Sacs creatures", conditions: [] }, { name: "Self-sacs", conditions: [] }],
    packages: [{ name: "Sacrifice", wires: [{ sources: ["Sacs creatures"], targets: ["Sacrifice Matters"] }] }],
  }
}

test("adding to a wire puts the group on that wire's other side", () => {
  const before = rules()
  const option = { kind: "add-to-wire", package: "Sacrifice", wire: 0, side: "targets", group: "Self-sacs" }
  const after = applyLink(before, option, "Sacs creatures", "Self-sacs", "")
  assert.deepEqual(after.packages[0].wires[0].targets, ["Sacrifice Matters", "Self-sacs"])
  assert.deepEqual(before.packages[0].wires[0].targets, ["Sacrifice Matters"])
})

test("a new wire goes in the named package", () => {
  const after = applyLink(rules(), { kind: "new-wire" }, "Sacs creatures", "Self-sacs", "Sacrifice")
  assert.deepEqual(after.packages[0].wires[1], { sources: ["Sacs creatures"], targets: ["Self-sacs"] })
})

test("a new package holds one wire between the two groups", () => {
  const after = applyLink(rules(), { kind: "new-package" }, "Sacs creatures", "Self-sacs", "Aristocrats")
  assert.deepEqual(after.packages[1], { name: "Aristocrats", wires: [{ sources: ["Sacs creatures"], targets: ["Self-sacs"] }] })
})
