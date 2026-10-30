import { test } from "node:test"
import assert from "node:assert/strict"
import { cardHasOracleTag } from "./cardRoles.js"

test("cardHasOracleTag reads full tags, then roles, by slug in any spelling", () => {
  const statsRow = { oracle_tags: ["cycle", "removal", "removal-creature"] }
  const deckCard = { roles: ["mill-self"] }
  assert.equal(cardHasOracleTag(statsRow, "removal"), true)
  assert.equal(cardHasOracleTag(statsRow, "Removal-Creature"), true)
  assert.equal(cardHasOracleTag(deckCard, '"mill self"'), true)
  assert.equal(cardHasOracleTag(deckCard, "removal"), false)
  assert.equal(cardHasOracleTag({}, "removal"), false)
})
