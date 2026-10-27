import { test } from "node:test"
import assert from "node:assert/strict"
import { ALL_SOURCES, VIEW_SOURCES, viewNeeds } from "./viewSources.js"

test("cards needs card stats but not health", () => {
  assert.equal(viewNeeds("cards", "cardStats"), true)
  assert.equal(viewNeeds("cards", "health"), false)
})

test("the synergy map needs only the cube and its rules", () => {
  assert.deepEqual(VIEW_SOURCES.designmap, ["cube", "designGraph"])
})

test("every view's sources are known sources", () => {
  for (const sources of Object.values(VIEW_SOURCES)) {
    for (const source of sources) {
      assert.ok(ALL_SOURCES.includes(source), source)
    }
  }
})

test("an unknown view needs every source", () => {
  assert.equal(viewNeeds("whatever", "health"), true)
})

test("the archetypes page loads its over-time stats from the server", () => {
  assert.equal(viewNeeds("types", "archetypeStatsOverTime"), true)
})
