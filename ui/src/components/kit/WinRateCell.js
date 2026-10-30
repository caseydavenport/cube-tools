// WinRateCell is the one table cell for a win rate: it shows the Bayes win %,
// greyed when it can't be told apart from a coin flip, with the raw rate, the
// interval, the record and the games in its hover.

import React from "react"
import { HoverStats } from "./HoverStats.js"
import { winRateMuted, winRateRows, winRateText } from "./winRate.js"
import "./kit.css"

// confidencePercent turns a confidence setting like "0.8" into 80, defaulting
// to 80 when none is set.
function confidencePercent(confidence) {
  const value = parseFloat(confidence || "0.8")
  return Math.round(value * 100)
}

// WinRateCell renders a <td> for a server win-rate Record. confidence is the
// page's confidence setting, used to label the interval. onClick and id pass
// through to the cell, for tables whose rows select something on click.
export function WinRateCell({ record, confidence, onClick, id }) {
  const rows = winRateRows(record, confidencePercent(confidence))
  let className = undefined
  if (winRateMuted(record)) {
    className = "kit-win-muted"
  }
  const cell = <td id={id} onClick={onClick} className={className}>{winRateText(record)}</td>
  if (rows.length === 0) {
    return cell
  }

  let footer = "different from 50%"
  if (winRateMuted(record)) {
    footer = "can't be told apart from 50%"
  }
  return (
    <HoverStats title="Bayes win %" rows={rows} footer={footer}>
      {cell}
    </HoverStats>
  )
}
