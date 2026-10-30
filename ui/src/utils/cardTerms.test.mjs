import { test } from "node:test"
import assert from "node:assert/strict"
import { exactNameMatches } from "./cardTerms.js"

test("a card matches any of several card: terms", () => {
  const terms = ['card:"Goblin Bombardment"', 'card:"Mayhem Devil"']
  assert.equal(exactNameMatches(terms, "Goblin Bombardment"), true)
  assert.equal(exactNameMatches(terms, "Mayhem Devil"), true)
  assert.equal(exactNameMatches(terms, "Shock"), false)
})

test("card: matches the whole name, ignoring case", () => {
  assert.equal(exactNameMatches(['card:"bolt"'], "Lightning Bolt"), false)
  assert.equal(exactNameMatches(['card:"lightning bolt"'], "Lightning Bolt"), true)
  assert.equal(exactNameMatches(['card:"Fire // Ice"'], "Fire // Ice"), true)
})
