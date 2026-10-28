import { test } from "node:test"
import assert from "node:assert/strict"
import { forestPoints, forestRowLabel, toDeckCharts } from "./deckChartsData.js"

test("an empty answer becomes empty charts", () => {
  const charts = toDeckCharts({})
  assert.deepEqual(charts.head_to_head, {})
  assert.deepEqual(charts.close_matches, [])
  assert.deepEqual(charts.forest, [])
  assert.deepEqual(charts.mana_curve, [])
  assert.deepEqual(charts.type_mix, [])
  assert.deepEqual(charts.splash, [])
})

test("null fields from the server become empty too", () => {
  const charts = toDeckCharts({ forest: null, head_to_head: null })
  assert.deepEqual(charts.forest, [])
  assert.deepEqual(charts.head_to_head, {})
})

test("a forest row with an effect gets a dot and a bar", () => {
  const points = forestPoints([
    { key: "creatures", has_effect: true, effect: 1.5, effect_low: -1, effect_high: 4 },
  ])
  assert.deepEqual(points.labels, ["creatures"])
  assert.deepEqual(points.dots, [1.5])
  assert.deepEqual(points.bars, [[-1, 4]])
  assert.deepEqual(points.notes, [false])
})

test("a forest row without an effect gets a note and no dot", () => {
  const points = forestPoints([
    { key: "lands", has_effect: false, effect: 0, effect_low: 0, effect_high: 0 },
  ])
  assert.deepEqual(points.dots, [null])
  assert.deepEqual(points.bars, [null])
  assert.deepEqual(points.notes, [true])
})

test("a row without an effect says so in its label", () => {
  assert.equal(forestRowLabel("Planeswalkers", true), "Planeswalkers (not enough data)")
})

test("a row with an effect keeps its plain label", () => {
  assert.equal(forestRowLabel("Creatures", false), "Creatures")
})
