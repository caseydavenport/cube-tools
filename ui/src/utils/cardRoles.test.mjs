import { test } from "node:test"
import assert from "node:assert/strict"
import { cardHasOracleTag, cardMatchesTagFilter, isCounterspell, isInteraction, isRemoval } from "./cardRoles.js"

test("cardHasOracleTag reads full tags, then roles, by slug in any spelling", () => {
  const statsRow = { oracle_tags: ["cycle", "removal", "removal-creature"] }
  const deckCard = { roles: ["mill-self"] }
  assert.equal(cardHasOracleTag(statsRow, "removal"), true)
  assert.equal(cardHasOracleTag(statsRow, "Removal-Creature"), true)
  assert.equal(cardHasOracleTag(deckCard, '"mill self"'), true)
  assert.equal(cardHasOracleTag(deckCard, "removal"), false)
  assert.equal(cardHasOracleTag({}, "removal"), false)
})

test("isRemoval and isCounterspell read the card's roles", () => {
  assert.equal(isRemoval({ roles: ["removal", "removal-creature"] }), true)
  assert.equal(isRemoval({ roles: ["counterspell"] }), false)
  assert.equal(isCounterspell({ roles: ["counterspell"] }), true)
  assert.equal(isRemoval({ name: "Bear" }), false)
})

test("isInteraction counts removal, counterspells and hand disruption", () => {
  assert.equal(isInteraction({ roles: ["removal"] }), true)
  assert.equal(isInteraction({ roles: ["counterspell"] }), true)
  assert.equal(isInteraction({ roles: ["hand-disruption"] }), true)
  assert.equal(isInteraction({ roles: ["draw", "discard-outlet"] }), false)
})

test("cardMatchesTagFilter passes every card when no tag is chosen", () => {
  assert.equal(cardMatchesTagFilter({ name: "Bear" }, ""), true)
  assert.equal(cardMatchesTagFilter({ name: "Bear" }, null), true)
  assert.equal(cardMatchesTagFilter({ oracle_tags: ["persist"] }, "persist"), true)
  assert.equal(cardMatchesTagFilter({ name: "Bear" }, "persist"), false)
})
