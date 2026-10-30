import { test } from "node:test"
import assert from "node:assert/strict"
import { sortPlayerRows } from "./playerTable.js"

// player builds a player row with the given matches and decks.
function player(name, matches, numDecks, extra = {}) {
  return { name, num_decks: numDecks, tendencies: { matches }, ...extra }
}

test("sortPlayerRows defaults to matches with ties by drafts then name", () => {
  const rows = [
    player("Ozzy", 10, 3),
    player("Joan", 25, 8),
    player("Stevie", 10, 4),
    player("Freddie", 10, 4),
  ]
  assert.deepEqual(sortPlayerRows(rows, "", false).map(r => r.name), ["Joan", "Freddie", "Stevie", "Ozzy"])
  assert.deepEqual(sortPlayerRows(rows, "matches", false).map(r => r.name), ["Joan", "Freddie", "Stevie", "Ozzy"])
})

test("sortPlayerRows inverts and sorts other columns", () => {
  const rows = [
    player("Ozzy", 10, 3, { bayesian_win_percent: 55 }),
    player("Joan", 25, 8, { bayesian_win_percent: 48 }),
  ]
  assert.deepEqual(sortPlayerRows(rows, "win_percent", false).map(r => r.name), ["Ozzy", "Joan"])
  assert.deepEqual(sortPlayerRows(rows, "matches", true).map(r => r.name), ["Ozzy", "Joan"])
  assert.deepEqual(sortPlayerRows(rows, "name", false).map(r => r.name), ["Joan", "Ozzy"])
})

test("sortPlayerRows leaves the input alone", () => {
  const rows = [player("Ozzy", 1, 1), player("Joan", 2, 1)]
  sortPlayerRows(rows, "matches", false)
  assert.deepEqual(rows.map(r => r.name), ["Ozzy", "Joan"])
})
