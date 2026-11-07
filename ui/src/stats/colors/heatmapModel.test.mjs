import { test } from "node:test"
import assert from "node:assert/strict"
import { cellShade, heatmapColorType, heatmapGroups, isShownCell, showsPairsInstead } from "./heatmapModel.js"

test("the heatmap shows single colors for Mono and pairs otherwise", () => {
  assert.equal(heatmapColorType("Mono"), "Mono")
  assert.equal(heatmapColorType("Any"), "Dual")
  assert.equal(heatmapColorType("Trio"), "Dual")
  assert.equal(heatmapGroups("Mono").length, 5)
  assert.equal(heatmapGroups("Trio").length, 10)
})

test("only Any and Trio say the heatmap shows pairs instead", () => {
  assert.equal(showsPairsInstead("Any"), true)
  assert.equal(showsPairsInstead("Trio"), true)
  assert.equal(showsPairsInstead("Dual"), false)
  assert.equal(showsPairsInstead("Mono"), false)
})

test("each pairing is shown once, above the diagonal", () => {
  assert.equal(isShownCell(0, 1), true)
  assert.equal(isShownCell(1, 0), false)
  assert.equal(isShownCell(2, 2), false)
})

test("only significant cells are shaded, by the Bayes rate", () => {
  assert.equal(cellShade({ significant: true, bayesian_win_pct: 60 }), 0.2)
  assert.equal(cellShade({ significant: false, bayesian_win_pct: 70 }), 0)
  assert.equal(cellShade(undefined), 0)
})
