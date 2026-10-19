import { LIGHT, DARK } from "./tokens.js"

// Mantine saves the viewer's color scheme choice under this localStorage key.
const SCHEME_STORAGE_KEY = "mantine-color-scheme-value"

// chartTextColor returns the theme's current text color for Chart.js titles,
// legends, and ticks. It reads the CSS variable at call time, so a chart picks
// up a color scheme change the next time it renders.
export function chartTextColor() {
  const fromTheme = getComputedStyle(document.documentElement).getPropertyValue("--se-text").trim()
  if (fromTheme !== "") {
    return fromTheme
  }

  // The theme's CSS variables arrive just after the first render, so a chart
  // drawn before then guesses the scheme the same way Mantine will.
  if (prefersDark()) {
    return DARK.text
  }
  return LIGHT.text
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
