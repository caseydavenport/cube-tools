import { test } from "node:test"
import assert from "node:assert/strict"
import { chartTextColor } from "./chartColors.js"
import { LIGHT, DARK } from "./tokens.js"

// fakeBrowser stands in for the browser APIs chartTextColor reads: the --se-text
// CSS variable, the saved color scheme, and the OS dark-mode setting.
function fakeBrowser({ cssText = "", savedScheme = null, osDark = false }) {
  globalThis.document = { documentElement: {} }
  globalThis.getComputedStyle = () => ({
    getPropertyValue: name => (name === "--se-text" ? cssText : ""),
  })
  globalThis.localStorage = { getItem: () => savedScheme }
  globalThis.matchMedia = () => ({ matches: osDark })
}

test("chart text follows the theme's text color", () => {
  fakeBrowser({ cssText: " #2a2238 " })
  assert.equal(chartTextColor(), "#2a2238")
})

test("before the theme loads, a saved light scheme gets dark text", () => {
  fakeBrowser({ savedScheme: "light", osDark: true })
  assert.equal(chartTextColor(), LIGHT.text)
})

test("before the theme loads, a saved dark scheme gets light text", () => {
  fakeBrowser({ savedScheme: "dark" })
  assert.equal(chartTextColor(), DARK.text)
})

test("before the theme loads, with no saved scheme, the OS setting decides", () => {
  fakeBrowser({ savedScheme: "auto", osDark: false })
  assert.equal(chartTextColor(), LIGHT.text)

  fakeBrowser({ savedScheme: null, osDark: true })
  assert.equal(chartTextColor(), DARK.text)
})
