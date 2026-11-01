import React from "react"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { nextSort } from "./sortOrder.js"

// SortHeader is a clickable header cell for a sortable stats table. The sorted
// column is highlighted with an arrow for its direction, and clicking a column
// sorts by it (or flips it, if it's already the sorted one). numeric columns
// are right-aligned and start high to low. A tip, when given, explains the
// column in a hover popover; className adds classes to the cell.
export function SortHeader({ sortKey, label, tip, sort, setSort, numeric = true, className: extra = "" }) {
  const active = sort.key === sortKey

  let className = "header-cell stats-sort-header"
  if (active) {
    className += " stats-sort-active"
  }
  if (numeric) {
    className += " stats-numeric"
  }
  if (extra) {
    className += " " + extra
  }

  let arrow = ""
  if (active && sort.dir === "asc") {
    arrow = " ▲"
  } else if (active) {
    arrow = " ▼"
  }

  const cell = (
    <td className={className} onClick={() => setSort(current => nextSort(current, sortKey, numeric))}>
      {label}{arrow}
    </td>
  )
  if (!tip) {
    return cell
  }
  return <HoverInfo title={label} info={tip}>{cell}</HoverInfo>
}
