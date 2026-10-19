import { test } from "node:test"
import assert from "node:assert/strict"
import { initialDates, presetRange, rangeLabel, rangePreset, todayString } from "./dateRanges.js"

const COPY = { allTime: "All time", last12Months: "Last 12 months" }

test("all time runs from the first draft date to today", () => {
  assert.deepEqual(presetRange("all", "2026-10-19"), { start: "1990-09-15", end: "2026-10-19" })
})

test("last 12 months starts on the same day a year earlier", () => {
  assert.deepEqual(presetRange("12m", "2026-10-19"), { start: "2025-10-19", end: "2026-10-19" })
})

test("last 12 months from a leap day starts on Feb 28", () => {
  assert.deepEqual(presetRange("12m", "2028-02-29"), { start: "2027-02-28", end: "2028-02-29" })
})

test("rangePreset recognizes each preset", () => {
  assert.equal(rangePreset("1990-09-15", "2026-10-19", "2026-10-19"), "all")
  assert.equal(rangePreset("2025-10-19", "2026-10-19", "2026-10-19"), "12m")
})

test("rangePreset returns null for a custom range", () => {
  assert.equal(rangePreset("2026-01-01", "2026-03-01", "2026-10-19"), null)
})

test("rangeLabel names a preset or shows a custom range's dates", () => {
  assert.equal(rangeLabel("1990-09-15", "2026-10-19", "2026-10-19", COPY), "All time")
  assert.equal(rangeLabel("2025-10-19", "2026-10-19", "2026-10-19", COPY), "Last 12 months")
  assert.equal(rangeLabel("2026-01-01", "2026-03-01", "2026-10-19", COPY), "2026-01-01 – 2026-03-01")
})

test("todayString formats a local date as YYYY-MM-DD", () => {
  assert.equal(todayString(new Date(2026, 9, 5)), "2026-10-05")
})

test("the initial range is all time up to today", () => {
  assert.deepEqual(initialDates("2026-10-19"), ["1990-09-15", "2026-10-19"])
})
