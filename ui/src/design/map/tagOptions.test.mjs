import { test } from "node:test"
import assert from "node:assert/strict"
import { addTagCondition, tagOptions } from "./tagOptions.js"

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
