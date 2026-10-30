import { test } from "node:test"
import assert from "node:assert/strict"
import { addTagCondition, distinctiveLabel, tagFilterOptions, tagOptions } from "./tagOptions.js"

test("tagOptions labels each tag with its cube card count, keeping order", () => {
  const tags = [
    { slug: "removal", cards: 90, description: "Removes things." },
    { slug: "sweeper", cards: 21, description: "Removes many things." },
  ]
  assert.deepEqual(tagOptions(tags), [
    { value: "removal", label: "removal (90)", description: "Removes things." },
    { value: "sweeper", label: "sweeper (21)", description: "Removes many things." },
  ])
  assert.deepEqual(tagOptions(undefined), [])
})

test("addTagCondition fills the first empty condition", () => {
  assert.deepEqual(addTagCondition(["t:creature", "", ""], "sweeper"), ["t:creature", "otag:sweeper", ""])
})

test("addTagCondition appends when no condition is empty", () => {
  assert.deepEqual(addTagCondition(["t:creature"], "sweeper"), ["t:creature", "otag:sweeper"])
})

test("distinctiveLabel shows the tag, its cube cards and its whole-number lift", () => {
  assert.equal(distinctiveLabel({ slug: "persist", cards: 12, lift: 45.6 }), "persist · 12 cards · 46×")
})

test("tagFilterOptions groups Cube Cobra tags, distinctive tags, then the rest", () => {
  const cubeCobra = [{ label: "", value: "" }, { label: "Watch", value: "watch" }]
  const cubeTags = {
    tags: [
      { slug: "removal", cards: 90, lift: 1.2 },
      { slug: "persist", cards: 12, lift: 45.6 },
    ],
    distinctive: [{ slug: "persist", cards: 12, lift: 45.6 }],
  }
  assert.deepEqual(tagFilterOptions(cubeCobra, cubeTags), [
    { group: "Cube Cobra tags", items: [{ value: "cctag:watch", label: "Watch" }] },
    { group: "Distinctive Scryfall tags", items: [{ value: "otag:persist", label: "persist · 12 cards · 46×" }] },
    { group: "Scryfall tags", items: [{ value: "otag:removal", label: "removal (90)" }] },
  ])
})

test("tagFilterOptions leaves out groups with nothing in them", () => {
  const options = tagFilterOptions([{ label: "Watch", value: "watch" }], { tags: [], distinctive: [] })
  assert.deepEqual(options.map(o => o.group), ["Cube Cobra tags"])
})
