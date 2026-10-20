// Colors and math the Deck stats charts share.

import { currentChartTheme, seriesColor } from "../../theme/chartTheme.js"

// Wins and losses are good and bad, read by functions so Chart.js picks them
// again on a scheme change. In-deck and in-sideboard lines are two series
// colors, which are the same in both schemes.
export const winColor = () => currentChartTheme().goodFill

export const lossColor = () => currentChartTheme().badFill

export const inDeckColor = seriesColor(0)

export const inSideboardColor = seriesColor(2)

// average divides total by count, or gives null for an empty bucket so the
// chart leaves a gap instead of plotting NaN.
export function average(total, count) {
  if (count === 0) {
    return null
  }
  return total / count
}
