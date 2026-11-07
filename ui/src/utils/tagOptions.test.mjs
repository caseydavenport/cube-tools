import { test } from "node:test"
import assert from "node:assert/strict"
import { addTagCondition, distinctiveLabel, searchTagValues, tagOptions } from "./tagOptions.js"

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

test("searchTagValues lists Cube Cobra tags and distinctive Scryfall tags first", () => {
  const cubeCobra = [{ label: "", value: "" }, { label: "Watch", value: "watch" }]
  const cubeTags = {
    tags: [
      { slug: "removal", cards: 90, lift: 1.2 },
      { slug: "persist", cards: 12, lift: 45.6 },
    ],
    distinctive: [{ slug: "persist", cards: 12, lift: 45.6 }],
  }
  assert.deepEqual(searchTagValues(cubeCobra, cubeTags), {
    cctag: [{ value: "watch", description: "Watch" }],
    otag: [
      { value: "persist", description: "12 cards · 46× as common as in all of Magic" },
      { value: "removal", description: "90 cards" },
    ],
  })
})



