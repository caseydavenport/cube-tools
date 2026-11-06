import { test } from "node:test"
import assert from "node:assert/strict"
import { requestFilters } from "./hiddenFilters.js"

const SET = { synergyRecord: "winning" }

test("a cube without results drops the record", () => {
  assert.deepEqual(requestFilters(SET, { results: false }), { synergyRecord: "all" })
})

test("a cube with results keeps it", () => {
  assert.deepEqual(requestFilters(SET, { results: true }), SET)
})

test("unknown info keeps it", () => {
  assert.deepEqual(requestFilters(SET, {}), SET)
})
