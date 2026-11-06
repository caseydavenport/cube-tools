import { test } from "node:test"
import assert from "node:assert/strict"
import { expectedByChance, matchesPopularity, popularityLabel } from "./cardFilters.js"

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

test("expected by chance is the tested count times one minus confidence", () => {
  assert.equal(expectedByChance(339, "0.95"), 17)
  assert.equal(expectedByChance(339, 0.8), 68)
})

test("a confidence outside 0 to 1 expects nothing", () => {
  assert.equal(expectedByChance(339, ""), 0)
  assert.equal(expectedByChance(339, "1"), 0)
})
