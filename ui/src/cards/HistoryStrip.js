// The card page's cube history: one square per draft, showing whether the
// card was played, in the cube, out of it, or unknown.

import React from "react"
import { historyTitle } from "./cardPageModel.js"

// LEGEND names the strip's states, in the order the legend lists them.
const LEGEND = [
  { state: "played", label: "Played" },
  { state: "in", label: "In the cube" },
  { state: "out", label: "Not in the cube" },
  { state: "unknown", label: "No cube list" },
]

// squareClass picks a square's look: its state, faded when the draft is
// outside the page's date range.
function squareClass(cell) {
  let className = `card-history-square card-history-${cell.state}`
  if (!cell.in_range) {
    className += " card-history-outside"
  }
  return className
}

// HistoryStrip draws the history squares with their legend. history is the
// server's list, one entry per draft in draft order.
export function HistoryStrip({ history }) {
  if (!history || history.length === 0) {
    return null
  }
  return (
    <div className="card-history">
      <div className="card-history-label">Cube history, one square per draft</div>
      <div className="card-history-squares">
        {history.map(cell => <span key={cell.draft_id} className={squareClass(cell)} title={historyTitle(cell)} />)}
      </div>
      <div className="card-history-legend">
        {LEGEND.map(item => (
          <span key={item.state}>
            <span className={`card-history-square card-history-${item.state}`} /> {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
