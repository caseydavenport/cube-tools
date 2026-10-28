// Colors and math the Deck stats charts share.

import { currentChartTheme, seriesColor, withAlpha } from "../../theme/chartTheme.js"

// In-deck and in-sideboard lines are two series colors, which are the same
// in both schemes.
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

// lineAtGrid returns a grid color callback that draws the line at value
// stronger than the rest, such as 50% on a win rate axis.
export function lineAtGrid(value) {
  return (ctx) => {
    const theme = currentChartTheme()
    if (ctx.tick.value === value) {
      return theme.zeroLine
    }
    return theme.grid
  }
}

// intervalDataset draws each [low, high] pair as a thin floating bar, the
// confidence interval around a point. A null pair draws nothing.
export function intervalDataset(label, bars) {
  return {
    label,
    data: bars,
    backgroundColor: () => withAlpha(currentChartTheme().text, 0.25),
    borderColor: () => currentChartTheme().text,
    borderWidth: 1,
    barPercentage: 0.25,
    grouped: false,
    order: 2,
  }
}

// pointDataset draws each value as a dot with no line between them, drawn
// over the interval bars.
export function pointDataset(label, values) {
  return {
    type: "line",
    label,
    data: values,
    showLine: false,
    pointRadius: 6,
    pointHoverRadius: 8,
    borderColor: () => currentChartTheme().text,
    backgroundColor: () => seriesColor(0),
    order: 1,
  }
}

// titleOptions is the bold title every Deck stats chart shows.
export function titleOptions(text) {
  return {
    display: true,
    text,
    font: {
      size: "16pt",
    },
  }
}
