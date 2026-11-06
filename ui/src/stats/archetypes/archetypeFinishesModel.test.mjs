import { test } from "node:test"
import assert from "node:assert/strict"
import { finishRows } from "./archetypeFinishesModel.js"

// row builds an archetypes-endpoint row with the counts finishRows reads.
function row(count, trophies, winning, losing, lastPlace) {
  return { count, trophies, winning, losing, last_place: lastPlace }
}

test("finishes split decks without counting trophies or last places twice", () => {
  const data = new Map([["aggro", row(10, 2, 5, 4, 1)]])

  const [aggro] = finishRows(data)
  assert.deepEqual(aggro.counts, { trophy: 2, winning: 3, even: 1, losing: 3, last: 1 })
  assert.equal(aggro.shares.trophy, 20)
  assert.equal(aggro.decks, 10)
})

test("finishes leave out tags and archetypes with no decks", () => {
  const data = new Map([
    ["control", row(4, 1, 2, 2, 0)],
    ["midrange", row(0, 0, 0, 0, 0)],
    ["Reanimator", row(6, 1, 3, 3, 1)],
  ])

  assert.deepEqual(finishRows(data).map(r => r.type), ["control"])
})
