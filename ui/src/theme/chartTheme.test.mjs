import { test } from "node:test"
import assert from "node:assert/strict"
import { applyChartTheme, chartThemeFor, currentChartTheme, deltaFill, resetChartTheme, seriesColor, withAlpha, zeroLineGrid } from "./chartTheme.js"
import { LIGHT, DARK, SERIES } from "./tokens.js"

// fakeBrowser stands in for the browser APIs the scheme guess reads: the saved
// color scheme and the OS dark-mode setting.
function fakeBrowser({ savedScheme = null, osDark = false }) {
  globalThis.localStorage = { getItem: () => savedScheme }
  globalThis.matchMedia = () => ({ matches: osDark })
}

// fakeChartJS is the part of Chart.js that applyChartTheme touches: the
// defaults object and the live chart instances, each counting its updates.
function fakeChartJS() {
  const updates = []
  const chart = { update: mode => updates.push(mode) }
  return { chartJS: { defaults: {}, instances: { a: chart, b: chart } }, updates }
}

test("withAlpha turns a hex color into rgba", () => {
  assert.equal(withAlpha("#16a34a", 0.5), "rgba(22, 163, 74, 0.5)")
})

test("the chart theme comes from the scheme's tokens", () => {
  assert.equal(chartThemeFor("light").text, LIGHT.text)
  assert.equal(chartThemeFor("dark").grid, withAlpha(DARK.text, 0.1))
  assert.equal(chartThemeFor("dark").goodFill, withAlpha(DARK.good, 0.85))
  assert.equal(chartThemeFor("light").background, LIGHT.page)
})

test("series colors cycle through the palette", () => {
  assert.equal(seriesColor(0), SERIES[0])
  assert.equal(seriesColor(8), SERIES[0])
  assert.equal(seriesColor(9), SERIES[1])
})

test("applying a scheme sets the defaults and redraws every chart", () => {
  const { chartJS, updates } = fakeChartJS()
  applyChartTheme(chartJS, "dark")

  assert.equal(chartJS.defaults.color, DARK.text)
  assert.equal(chartJS.defaults.borderColor, withAlpha(DARK.text, 0.1))
  assert.deepEqual(updates, ["none", "none"])
  assert.equal(currentChartTheme().text, DARK.text)
})

test("before a scheme is applied, a saved light choice wins over a dark OS", () => {
  resetChartTheme()
  fakeBrowser({ savedScheme: "light", osDark: true })
  assert.equal(currentChartTheme().text, LIGHT.text)
})

test("before a scheme is applied, with no saved choice, the OS setting decides", () => {
  resetChartTheme()
  fakeBrowser({ osDark: true })
  assert.equal(currentChartTheme().text, DARK.text)
})

test("the zero line stands out from the other grid lines", () => {
  const { chartJS } = fakeChartJS()
  applyChartTheme(chartJS, "light")

  assert.equal(zeroLineGrid({ tick: { value: 0 } }), chartThemeFor("light").zeroLine)
  assert.equal(zeroLineGrid({ tick: { value: 5 } }), chartThemeFor("light").grid)
})

test("delta bars are good at or above zero and bad below", () => {
  const { chartJS } = fakeChartJS()
  applyChartTheme(chartJS, "dark")

  assert.equal(deltaFill(0), chartThemeFor("dark").goodFill)
  assert.equal(deltaFill(-2), chartThemeFor("dark").badFill)
})

test("a scheme change recolors scale colors copied from the old defaults", () => {
  const ownGrid = ctx => "own"
  const chart = {
    update: () => {},
    config: {
      options: {
        scales: {
          x: { ticks: { color: "#666" }, grid: { color: "rgba(0,0,0,0.1)" }, title: { color: "#666" } },
          y: { ticks: { color: "#123456" }, grid: { color: ownGrid } },
        },
      },
    },
  }
  const chartJS = { defaults: { color: "#666", borderColor: "rgba(0,0,0,0.1)" }, instances: { a: chart } }

  applyChartTheme(chartJS, "dark")

  const dark = chartThemeFor("dark")
  const { x, y } = chart.config.options.scales
  assert.equal(x.ticks.color, dark.text)
  assert.equal(x.grid.color, dark.grid)
  assert.equal(x.title.color, dark.text)
  assert.equal(y.ticks.color, "#123456")
  assert.equal(y.grid.color, ownGrid)
})

// Mantine marks the page with the new scheme as soon as it switches, before
// the effect that calls applyChartTheme runs. Colors picked while the page
// re-renders for the switch must already be the new scheme's.
test("the scheme Mantine has put on the page wins over the last applied one", () => {
  const { chartJS } = fakeChartJS()
  applyChartTheme(chartJS, "light")
  globalThis.document = { documentElement: { getAttribute: () => "dark" } }
  try {
    assert.equal(currentChartTheme().text, DARK.text)
  } finally {
    delete globalThis.document
  }
})
