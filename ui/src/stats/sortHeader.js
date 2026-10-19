import React from "react"
import { nextSort } from "./sortOrder.js"

// SortHeader is a clickable header cell for a sortable stats table. The sorted
// column is highlighted with an arrow for its direction, and clicking a column
// sorts by it (or flips it, if it's already the sorted one). numeric columns
// are right-aligned and start high to low.
export function SortHeader({ sortKey, label, sort, setSort, numeric = true }) {
  const active = sort.key === sortKey

  let className = "header-cell stats-sort-header"
  if (active) {
    className += " stats-sort-active"
  }
  if (numeric) {
    className += " stats-numeric"
  }

  let arrow = ""
  if (active && sort.dir === "asc") {
    arrow = " ▲"
  } else if (active) {
    arrow = " ▼"
  }

  return (
    <td className={className} onClick={() => setSort(current => nextSort(current, sortKey, numeric))}>
      {label}{arrow}
    </td>
  )
}
