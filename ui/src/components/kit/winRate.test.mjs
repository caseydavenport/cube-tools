import { test } from "node:test"
import assert from "node:assert/strict"
import { winRateMuted, winRateRows, winRateText, winRateValue } from "./winRate.js"

// record builds a server Record with the given counts and rates.
function record(fields) {
  return {
    wins: 0, losses: 0, draws: 0,
    win_percent: 0, bayesian_win_percent: 0,
    win_percent_low: 0, win_percent_high: 0, significant: false,
    ...fields,
  }
}

const sixAndOh = record({ wins: 6, win_percent: 100, bayesian_win_percent: 58.3, win_percent_low: 78, win_percent_high: 100, significant: true })
const coinFlip = record({ wins: 5, losses: 5, draws: 1, win_percent: 50, bayesian_win_percent: 50, win_percent_low: 32, win_percent_high: 68 })
const empty = record({})

test("winRateValue is the Bayes rate, or null with no games", () => {
  assert.equal(winRateValue(sixAndOh), 58.3)
  assert.equal(winRateValue(empty), null)
  assert.equal(winRateValue(undefined), null)
})

test("winRateText rounds the Bayes rate, or shows a dash with no games", () => {
  assert.equal(winRateText(sixAndOh), "58%")
  assert.equal(winRateText(empty), "—")
})

test("winRateMuted greys a rate that can't be told from 50%", () => {
  assert.equal(winRateMuted(coinFlip), true)
  assert.equal(winRateMuted(sixAndOh), false)
  assert.equal(winRateMuted(empty), false)
})

test("winRateRows lists the raw rate, interval, record, games and difference", () => {
  const rows = winRateRows(sixAndOh, 80)
  assert.deepEqual(rows.map(r => r.label), ["Raw win %", "80% interval", "Record", "Games", "vs average"])
  assert.equal(rows[0].value, "100%")
  assert.equal(rows[0].share, 1)
  assert.equal(rows[1].value, "78–100%")
  assert.equal(rows[2].value, "6-0")
  assert.equal(rows[3].value, 6)
  assert.equal(rows[4].value, "+8%")
})

test("winRateRows shows draws only when there are some, and signs a deficit", () => {
  const rows = winRateRows(record({ wins: 2, losses: 5, draws: 1, win_percent: 31, bayesian_win_percent: 47 }), 80)
  assert.equal(rows.find(r => r.label === "Record").value, "2-5-1")
  assert.equal(rows.find(r => r.label === "vs average").value, "-3%")
})

test("winRateRows is empty with no games", () => {
  assert.deepEqual(winRateRows(empty, 80), [])
})
