// Which column the Colors table sorts by. Kept free of React so node tests can
// load it.

import { visibleItems } from "../../utils/dataKinds.js"

// shownColorSort returns sortBy when its column is on screen, and "build"
// (Build %) when the cube can't fill that column, so rows never sort by a
// column the viewer can't see. columns are the table's column descriptors.
export function shownColorSort(sortBy, columns, info) {
  for (const column of visibleItems(columns, info)) {
    if (column.id === sortBy) {
      return sortBy
    }
  }
  return "build"
}
