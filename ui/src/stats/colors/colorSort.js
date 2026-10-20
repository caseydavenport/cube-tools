// Which columns the Colors table shows, and which one it sorts by. Kept free
// of React so node tests can load it.

import { meetsNeeds } from "../../utils/dataKinds.js"

// colorColumnShown reports whether a Colors table column is on screen: the
// cube has the data it needs, and a single-color column only shows in Mono.
export function colorColumnShown(column, info, colorType) {
  if (!meetsNeeds(info, column.needs)) {
    return false
  }
  if (column.monoOnly && colorType !== "Mono") {
    return false
  }
  return true
}

// shownColorSort returns sortBy when its column is on screen, and "build"
// (Build %) otherwise, so rows never sort by a column the viewer can't see.
// columns are the table's column descriptors; colorType is Mono, Dual, or Trio.
export function shownColorSort(sortBy, columns, info, colorType) {
  for (const column of columns) {
    if (column.id === sortBy && colorColumnShown(column, info, colorType)) {
      return sortBy
    }
  }
  return "build"
}
