import { test } from "node:test"
import assert from "node:assert/strict"
import { archetypeFinishRows, finishRow } from "./finishesModel.js"

// row builds an archetypes-endpoint row with the counts the chart reads.
function row(count, trophies, winning, losing, lastPlace) {
  return { count, trophies, winning, losing, last_place: lastPlace }
}

test("finishes split decks without counting trophies or last places twice", () => {
  const r = finishRow("Aggro", { decks: 10, trophies: 2, winning: 5, losing: 4, lastPlace: 1 })
  assert.deepEqual(r.counts, { trophy: 2, winning: 3, even: 1, losing: 3, last: 1 })
  assert.equal(r.shares.trophy, 20)
  assert.equal(r.decks, 10)
})

test("archetype rows leave out tags and archetypes with no decks", () => {
  const data = new Map([
    ["control", row(4, 1, 2, 2, 0)],
    ["midrange", row(0, 0, 0, 0, 0)],
    ["Reanimator", row(6, 1, 3, 3, 1)],
  ])
  assert.deepEqual(archetypeFinishRows(data).map(r => r.label), ["Control"])
})
