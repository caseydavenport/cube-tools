import { test } from "node:test"
import assert from "node:assert/strict"
import { chartTextColor } from "./chartColors.js"

function stubCssVar(value) {
  globalThis.document = { documentElement: {} }
  globalThis.getComputedStyle = () => ({ getPropertyValue: name => (name === "--se-text" ? value : "") })
}

test("chart text follows the theme's text color", () => {
  stubCssVar(" #2a2238 ")
  assert.equal(chartTextColor(), "#2a2238")
})

test("chart text falls back to the dark-mode text color before the theme loads", () => {
  stubCssVar("")
  assert.equal(chartTextColor(), "#f4effa")
})
