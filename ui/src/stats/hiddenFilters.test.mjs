import { test } from "node:test"
import assert from "node:assert/strict"
import { requestFilters } from "./hiddenFilters.js"

const SET = { significantOnly: true, synergyRecord: "winning" }

test("a cube without results drops significant-only and the record", () => {
  assert.deepEqual(requestFilters(SET, { results: false }), { significantOnly: false, synergyRecord: "all" })
})

test("a cube with results keeps them", () => {
  assert.deepEqual(requestFilters(SET, { results: true }), SET)
})

test("unknown info keeps them", () => {
  assert.deepEqual(requestFilters(SET, {}), SET)
})
