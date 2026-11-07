// The Colors matchup heatmap's rules: which color groups it shows, which
// cells it fills, and how each cell is shaded. Kept free of React so node
// tests can load it.

import { DUAL_COLORS, MONO_COLORS } from "./colorTrendModel.js"

// heatmapColorType is the color type the heatmap shows for the table's: single
// colors for Mono, pairs for everything else. Three-color and mixed groups
// would leave nearly every cell with a handful of games.
export function heatmapColorType(tableType) {
  if (tableType === "Mono") {
    return "Mono"
  }
  return "Dual"
}

// heatmapGroups lists the heatmap's rows and columns for the table's type.
export function heatmapGroups(tableType) {
  if (heatmapColorType(tableType) === "Mono") {
    return MONO_COLORS
  }
  return DUAL_COLORS
}

// showsPairsInstead reports whether the table's type isn't one the heatmap
// draws, so the heatmap says it shows pairs instead.
export function showsPairsInstead(tableType) {
  return tableType === "Any" || tableType === "Trio"
}

// isShownCell reports whether the heatmap fills the cell at row index i and
// column index j. Each pairing appears once, above the diagonal: the other
// half would repeat it from the other side.
export function isShownCell(i, j) {
  return j > i
}

// cellShade is how strongly a cell is tinted, from -1 (row loses) to 1 (row
// wins), or 0 for no tint. Only cells whose interval leaves out 50% are
// tinted, by the Bayes rate's distance from 50%.
export function cellShade(record) {
  if (!record || !record.significant) {
    return 0
  }
  return (record.bayesian_win_pct - 50) / 50
}
