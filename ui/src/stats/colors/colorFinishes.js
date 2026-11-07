// The Colors page's finishes chart rows: how each color group's decks
// finished. Kept free of React so node tests can load it.

import { colorName } from "../../utils/colorNames.js"
import { finishRow } from "../finishes/finishesModel.js"
import { groupsFor } from "./colorTrendModel.js"

// MIN_FINISH_DECKS is how many decks a color group needs to get a bar, so
// one-deck groups don't fill the chart with 0% and 100% bars.
export const MIN_FINISH_DECKS = 5

// colorFinishRows returns one finishes row per color group of the color type
// with at least MIN_FINISH_DECKS decks, most built first. colorData maps a
// color group to its row from the colors endpoint.
export function colorFinishRows(colorData, colorType) {
  const rows = []
  for (const group of groupsFor(colorType)) {
    const row = colorData.get(group)
    if (!row || row.num_decks < MIN_FINISH_DECKS) {
      continue
    }
    rows.push(finishRow(colorName(group), {
      decks: row.num_decks,
      trophies: row.trophies,
      winning: row.top_half,
      losing: row.bottom_half,
      lastPlace: row.last_place,
    }))
  }
  rows.sort((a, b) => b.decks - a.decks)
  return rows
}
