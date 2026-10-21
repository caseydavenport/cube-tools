import { test } from "node:test"
import assert from "node:assert/strict"
import { meterWidth, toneClass } from "./hoverStatsHelpers.js"

test("meterWidth clamps and formats", () => {
  assert.equal(meterWidth(0.425), "42.5%")
  assert.equal(meterWidth(-1), "0%")
  assert.equal(meterWidth(2), "100%")
  assert.equal(meterWidth(undefined), "")
})

test("toneClass maps tones", () => {
  assert.equal(toneClass("good"), "kit-pop-good")
  assert.equal(toneClass("bad"), "kit-pop-bad")
  assert.equal(toneClass(""), "")
  assert.equal(toneClass(undefined), "")
  assert.equal(toneClass("loud"), "")
})
