import { test } from "node:test"
import assert from "node:assert/strict"
import { shownTab, splitArchetypes } from "./archetypeTabs.js"

test("rows split into macro archetypes and tags, leaving out rare ones", () => {
  const data = new Map([
    ["aggro", { type: "aggro", build_percent: 24 }],
    ["sacrifice", { type: "sacrifice", build_percent: 11 }],
    ["vampire", { type: "vampire", build_percent: 1 }],
  ])
  const { macroData, microData } = splitArchetypes(data)
  assert.deepEqual(macroData.map(r => r.type), ["aggro"])
  assert.deepEqual(microData.map(r => r.type), ["sacrifice"])
})

test("the tags tab shows only when there are tags to list", () => {
  assert.equal(shownTab("tags", true), "tags")
  assert.equal(shownTab("tags", false), "archetypes")
  assert.equal(shownTab("archetypes", true), "archetypes")
})
