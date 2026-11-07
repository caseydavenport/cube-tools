import { test } from "node:test"
import assert from "node:assert/strict"
import { defaultPicks, needsPicker, seriesFor, shownGroups } from "./colorTrendModel.js"

const DATA = new Map([
  ["WU", { build_percent: 5 }],
  ["BR", { build_percent: 20 }],
  ["WB", { build_percent: 12 }],
  ["UG", { build_percent: 9 }],
  ["W", { build_percent: 40 }],
])

test("mono needs no picker and shows every color", () => {
  assert.equal(needsPicker("Mono"), false)
  assert.deepEqual(shownGroups([], DATA, "Mono"), ["W", "U", "B", "R", "G"])
})

test("pairs default to the three most built", () => {
  assert.equal(needsPicker("Dual"), true)
  assert.deepEqual(defaultPicks(DATA, "Dual"), ["BR", "WB", "UG"])
  assert.deepEqual(shownGroups([], DATA, "Dual"), ["BR", "WB", "UG"])
})

test("picks outside the color type fall back to the defaults", () => {
  assert.deepEqual(shownGroups(["W"], DATA, "Dual"), ["BR", "WB", "UG"])
})

test("picks inside the color type are kept, at most three", () => {
  assert.deepEqual(shownGroups(["WU", "BR", "WB", "UG"], DATA, "Dual"), ["WU", "BR", "WB"])
})

test("a bucket without the group breaks the line", () => {
  const buckets = [{ data: { BR: { build_percent: 10 } } }, { data: {} }]
  assert.deepEqual(seriesFor(buckets, "BR", "builds"), [10, null])
})
