import { test } from "node:test"
import assert from "node:assert/strict"
import { archetypeMatch, pageSubtitle, pageTitle, percentOf, shownTopCards } from "./archetypePageModel.js"

const CARDS = [
  { name: "Sacred Foundry", land: true, decks: 15, in_share: 23, fit: 22 },
  { name: "Kellan", land: false, decks: 14, in_share: 21, fit: 20 },
  { name: "Rabbit Battery", land: false, decks: 18, in_share: 28, fit: 17 },
  { name: "Shock", land: false, decks: 1, in_share: 2, fit: 1 },
]

test("hiding lands drops land cards and keeps the rest", () => {
  const shown = shownTopCards(CARDS, { hideLands: true, minDecks: 1, sortBy: "" })
  assert.deepEqual(shown.map(c => c.name), ["Kellan", "Rabbit Battery", "Shock"])
})

test("showing lands keeps them, sorted by fit by default", () => {
  const shown = shownTopCards(CARDS, { hideLands: false, minDecks: 1, sortBy: "" })
  assert.equal(shown[0].name, "Sacred Foundry")
})

test("cards in fewer than the minimum decks are left out", () => {
  const shown = shownTopCards(CARDS, { hideLands: true, minDecks: 2, sortBy: "" })
  assert.equal(shown.some(c => c.name === "Shock"), false)
})

test("sorting by a column puts its highest values first", () => {
  const shown = shownTopCards(CARDS, { hideLands: true, minDecks: 1, sortBy: "decks" })
  assert.deepEqual(shown.map(c => c.name), ["Rabbit Battery", "Kellan", "Shock"])
})

test("sorting by name goes A to Z", () => {
  const shown = shownTopCards(CARDS, { hideLands: true, minDecks: 1, sortBy: "name" })
  assert.deepEqual(shown.map(c => c.name), ["Kellan", "Rabbit Battery", "Shock"])
})

test("macros are titled and called macro archetypes; tags keep their name", () => {
  assert.equal(pageTitle("aggro"), "Aggro")
  assert.equal(pageSubtitle("aggro"), "Macro archetype")
  assert.equal(pageTitle("sacrifice"), "sacrifice")
  assert.equal(pageSubtitle("sacrifice"), "Tag")
})

test("the deck filter quotes the name", () => {
  assert.equal(archetypeMatch("big mana"), 'arch:"big mana"')
})

test("a percent of nothing is 0", () => {
  assert.equal(percentOf(3, 0), 0)
  assert.equal(percentOf(25, 65), 38)
})
