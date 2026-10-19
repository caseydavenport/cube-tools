import { DARK } from "./tokens.js"

// chartTextColor returns the theme's current text color for Chart.js titles,
// legends, and ticks. It reads the CSS variable at call time, so a chart picks
// up a color scheme change the next time it renders.
export function chartTextColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--se-text").trim()
  return v || DARK.text
}
