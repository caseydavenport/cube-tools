import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CardScatterAxes, DeckScatterAxes, axisLabel,
  DEFAULT_CARD_X_AXIS, DEFAULT_CARD_Y_AXIS, DEFAULT_DECK_X_AXIS, DEFAULT_DECK_Y_AXIS,
} from "./scatterAxes.js"

function values(axes) {
  return axes.map(axis => axis.value)
}

test("each default axis is one of its list's option values", () => {
  assert.ok(values(CardScatterAxes).includes(DEFAULT_CARD_X_AXIS))
  assert.ok(values(CardScatterAxes).includes(DEFAULT_CARD_Y_AXIS))
  assert.ok(values(DeckScatterAxes).includes(DEFAULT_DECK_X_AXIS))
  assert.ok(values(DeckScatterAxes).includes(DEFAULT_DECK_Y_AXIS))
})

test("the default axes are the ones the pages opened with", () => {
  assert.equal(DEFAULT_CARD_X_AXIS, "num_decks")
  assert.equal(DEFAULT_CARD_Y_AXIS, "pick_elo")
  assert.equal(DEFAULT_DECK_X_AXIS, "creatures")
  assert.equal(DEFAULT_DECK_Y_AXIS, "interaction")
})

test("option values are unique within each list", () => {
  for (const axes of [CardScatterAxes, DeckScatterAxes]) {
    assert.equal(new Set(values(axes)).size, axes.length)
  }
})

test("axisLabel returns the label for a value, and the value for an unknown one", () => {
  assert.equal(axisLabel(CardScatterAxes, "num_decks"), "# Decks")
  assert.equal(axisLabel(DeckScatterAxes, "creatures"), "# creatures")
  assert.equal(axisLabel(DeckScatterAxes, "nope"), "nope")
})
