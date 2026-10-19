import { LIGHT, DARK, SERIES } from "./tokens.js"

// Mantine saves the viewer's color scheme choice under this localStorage key.
const SCHEME_STORAGE_KEY = "mantine-color-scheme-value"

// appliedScheme is the scheme applyChartTheme last set, or null before the
// first call. Hand-drawn canvas code reads it through currentChartTheme.
let appliedScheme = null

// withAlpha turns a "#rrggbb" color into an rgba() string with the given
// opacity, for grid lines and fills that should let the background through.
export function withAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// chartThemeFor returns the colors charts use in one color scheme: text,
// muted text, the page background (for halos behind canvas labels), grid
// lines, the emphasized zero line, and the good/bad colors as solid lines and
// as bar fills.
export function chartThemeFor(scheme) {
  let tokens = LIGHT
  if (scheme === "dark") {
    tokens = DARK
  }

  return {
    text: tokens.text,
    muted: tokens.muted,
    background: tokens.page,
    grid: withAlpha(tokens.text, 0.1),
    zeroLine: withAlpha(tokens.text, 0.5),
    good: tokens.good,
    bad: tokens.bad,
    goodFill: withAlpha(tokens.good, 0.85),
    badFill: withAlpha(tokens.bad, 0.85),
  }
}

// seriesColor picks the color for the index-th line or bar series in a chart
// whose series don't stand for Magic colors. It wraps around after eight.
export function seriesColor(index) {
  return SERIES[index % SERIES.length]
}

// currentChartTheme returns the chart colors for the scheme on screen. Code
// that paints a canvas by hand calls it at draw time, so the next redraw after
// a scheme change picks up the new colors.
export function currentChartTheme() {
  // Mantine marks the page before re-rendering for a switch, so this is right
  // even during that render, before applyChartTheme's effect has run.
  const onPage = pageScheme()
  if (onPage !== null) {
    return chartThemeFor(onPage)
  }

  if (appliedScheme !== null) {
    return chartThemeFor(appliedScheme)
  }

  // Before the app has applied a scheme, guess it the same way Mantine will.
  if (prefersDark()) {
    return chartThemeFor("dark")
  }
  return chartThemeFor("light")
}

// zeroLineGrid is a grid color callback for charts of gains and losses: the
// line at zero is drawn stronger than the rest so above and below read apart.
export function zeroLineGrid(ctx) {
  const theme = currentChartTheme()
  if (ctx.tick.value === 0) {
    return theme.zeroLine
  }
  return theme.grid
}

// deltaFill colors a bar that shows a gain or loss: good at or above zero,
// bad below.
export function deltaFill(delta) {
  const theme = currentChartTheme()
  if (delta >= 0) {
    return theme.goodFill
  }
  return theme.badFill
}

// applyChartTheme points Chart.js's default text and grid colors at the given
// scheme and redraws every chart on screen. Charts that don't set their own
// colors then follow the scheme. chartJS is passed in so tests can fake it.
export function applyChartTheme(chartJS, scheme) {
  const theme = chartThemeFor(scheme)
  const previous = { text: chartJS.defaults.color, grid: chartJS.defaults.borderColor }
  appliedScheme = scheme

  chartJS.defaults.color = theme.text
  chartJS.defaults.borderColor = theme.grid

  for (const chart of Object.values(chartJS.instances)) {
    recolorScales(chart, previous, theme)
    chart.update("none")
  }
}

// recolorScales swaps the old default colors in a chart's axes for the new
// ones. Chart.js copies the defaults into each axis when it first builds a
// chart and never refreshes them, so without this the ticks and grid would
// keep the old scheme. Colors a chart set for itself are left alone.
function recolorScales(chart, previous, theme) {
  if (!chart.config || !chart.config.options || !chart.config.options.scales) {
    return
  }

  for (const scale of Object.values(chart.config.options.scales)) {
    replaceColor(scale.ticks, previous.text, theme.text)
    replaceColor(scale.title, previous.text, theme.text)
    replaceColor(scale.grid, previous.grid, theme.grid)
    replaceColor(scale.border, previous.grid, theme.grid)
  }
}

// replaceColor sets part.color to to when it still holds from.
function replaceColor(part, from, to) {
  if (part && part.color === from) {
    part.color = to
  }
}

// resetChartTheme forgets the applied scheme, so tests can check the guess
// made before the app applies one.
export function resetChartTheme() {
  appliedScheme = null
}

// pageScheme returns the scheme Mantine has marked on the page, or null when
// there's no page (node tests) or no mark yet.
function pageScheme() {
  if (typeof document === "undefined") {
    return null
  }

  const scheme = document.documentElement.getAttribute("data-mantine-color-scheme")
  if (scheme === "dark" || scheme === "light") {
    return scheme
  }
  return null
}

// prefersDark reports whether the page is about to use dark mode: the viewer's
// saved choice if there is one, otherwise the operating system's setting.
function prefersDark() {
  let saved = null
  try {
    saved = localStorage.getItem(SCHEME_STORAGE_KEY)
  } catch {
    // Blocked storage just means there's no saved choice.
  }

  if (saved === "dark") {
    return true
  }
  if (saved === "light") {
    return false
  }
  return matchMedia("(prefers-color-scheme: dark)").matches
}
