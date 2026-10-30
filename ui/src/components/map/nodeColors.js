// The colors map nodes take for cards: mana color for one color, gold for
// several, and the theme's muted gray for colorless.

import { White, Blue, Black, Red, Green } from "../../utils/Colors.js"
import { currentChartTheme, seriesColor } from "../../theme/chartTheme.js"

// cardColor is the color a graph node keeps for a card, or null for a
// colorless card: its gray follows the color scheme, so the paint callback
// picks it at draw time instead of the node holding a stale one.
export function cardColor(colors) {
  if (!colors || colors.length === 0) {
    return null
  }
  return getNodeColor(colors)
}

// getNodeColor colors a card by its color identity: its mana color for mono,
// gold for multicolor, muted for colorless.
export function getNodeColor(colors) {
  // Must be 6-digit hex: withAlpha slices out the channel pairs, and a
  // 3-digit form produces an invalid rgba() that canvas silently ignores.
  if (!colors || colors.length === 0) return currentChartTheme().muted
  if (colors.length > 1) return seriesColor(2)
  switch (colors[0]) {
    case "W": return White
    case "U": return Blue
    case "B": return Black
    case "R": return Red
    case "G": return Green
    default: return currentChartTheme().muted
  }
}
