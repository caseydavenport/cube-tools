import { test } from "node:test"
import assert from "node:assert/strict"
import { colorFinishRows } from "./colorFinishes.js"

// row builds a colors-endpoint row with the counts the chart reads.
function row(decks, trophies, topHalf, bottomHalf, lastPlace) {
  return { num_decks: decks, trophies, top_half: topHalf, bottom_half: bottomHalf, last_place: lastPlace }
}

const DATA = new Map([
  ["WU", row(6, 1, 3, 2, 0)],
  ["BR", row(12, 2, 6, 5, 1)],
  ["UG", row(2, 0, 1, 1, 0)],
  ["W", row(30, 3, 15, 12, 2)],
])

test("pairs with enough decks get a bar, most built first", () => {
  const rows = colorFinishRows(DATA, "Dual")
  assert.deepEqual(rows.map(r => r.label), ["Rakdos", "Azorius"])
  assert.deepEqual(rows[0].counts, { trophy: 2, winning: 4, even: 1, losing: 4, last: 1 })
})

test("the color type picks which groups are charted", () => {
  assert.deepEqual(colorFinishRows(DATA, "Mono").map(r => r.decks), [30])
})
