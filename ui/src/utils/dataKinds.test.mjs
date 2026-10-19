import { test } from "node:test"
import assert from "node:assert/strict"
import { availableValue, hasData, meetsNeeds, visibleItems } from "./dataKinds.js"

// CC_INFO is what /info says for a CubeCobra cube with logged records.
const CC_INFO = { writable: false, decks: true, results: true, pick_logs: false, archetypes: false, sideboards: false }

// AXES is a cut-down scatter axis list: two need sideboards, two don't.
const AXES = [
  { value: "Pick ELO", needs: ["sideboards"] },
  { value: "# Sideboard", needs: ["sideboards"] },
  { value: "Win %", needs: ["results"] },
  { value: "# Decks" },
]

test("unknown data counts as present", () => {
  assert.equal(hasData({}, "results"), true)
})

test("data the cube reports as false is missing", () => {
  assert.equal(hasData({ results: false }, "results"), false)
})

test("write access must be known to be true", () => {
  assert.equal(hasData({}, "writable"), false)
  assert.equal(hasData({ writable: true }, "writable"), true)
})

test("meetsNeeds needs every listed kind", () => {
  assert.equal(meetsNeeds({ sideboards: false }, ["results"]), true)
  assert.equal(meetsNeeds({ sideboards: false }, ["results", "sideboards"]), false)
  assert.equal(meetsNeeds({ sideboards: false }), true)
})

test("visibleItems drops items whose needs the cube lacks, in order", () => {
  const items = [{ id: "a" }, { id: "b", needs: ["sideboards"] }, { id: "c", needs: ["results"] }]
  assert.deepEqual(visibleItems(items, { sideboards: false }).map(i => i.id), ["a", "c"])
})

test("availableValue keeps a value the cube can show", () => {
  assert.equal(availableValue("Win %", AXES, CC_INFO), "Win %")
})

test("availableValue falls back to the first visible item", () => {
  assert.equal(availableValue("Pick ELO", AXES, CC_INFO), "Win %")
})

test("availableValue is null when nothing is visible", () => {
  assert.equal(availableValue("x", [], {}), null)
})
