import { test } from "node:test"
import assert from "node:assert/strict"
import { matchesPopularity, popularityLabel } from "./cardFilters.js"

test("an empty popularity choice passes every card", () => {
  assert.equal(matchesPopularity({ popularity: "niche" }, ""), true)
  assert.equal(matchesPopularity({}, ""), true)
})

test("a popularity choice passes only cards with that label", () => {
  assert.equal(matchesPopularity({ popularity: "popular" }, "popular"), true)
  assert.equal(matchesPopularity({ popularity: "niche" }, "popular"), false)
  assert.equal(matchesPopularity({}, "popular"), false)
})

test("popularity labels are capitalized, and blank without a label", () => {
  assert.equal(popularityLabel("niche"), "Niche")
  assert.equal(popularityLabel(undefined), "")
})
