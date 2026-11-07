import { test } from "node:test"
import assert from "node:assert/strict"
import { macroDecks, macroShare, matchesPopularity, popularityLabel } from "./cardFilters.js"

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

test("macro shares split the decks that carried a macro archetype", () => {
  const card = { num_decks_by_macro: { aggro: 3, control: 1 } }
  assert.equal(macroDecks(card), 4)
  assert.equal(macroShare(card, "aggro"), 75)
  assert.equal(macroShare(card, "midrange"), 0)
})

test("a card with no macro-labeled decks has no share", () => {
  assert.ok(Number.isNaN(macroShare({ num_decks_by_macro: {} }, "aggro")))
  assert.ok(Number.isNaN(macroShare({}, "aggro")))
})
