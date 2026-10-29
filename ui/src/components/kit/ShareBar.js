// ShareBar is a thin bar inside a table cell showing a 0-1 share, so a column
// of rates reads at a glance without tinting the whole cell.

import React from "react"
import { meterWidth } from "./hoverStatsHelpers.js"
import "./kit.css"

// ShareBar draws a bar under a cell's value, filled to the share. A share that
// isn't a number draws nothing.
export function ShareBar({ share }) {
  const width = meterWidth(share)
  if (width === "") {
    return null
  }
  return (
    <span className="kit-share-bar">
      <span className="kit-share-bar-fill" style={{ width }} />
    </span>
  )
}
