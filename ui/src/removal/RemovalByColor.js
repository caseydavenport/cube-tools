// The Removal page's "Removal by color" table: how many spot-removal cards
// each color has, and the median share of creatures they can kill.

import React from "react"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { ColorImages } from "../utils/Colors.js"

// COLOR_LABELS name each row next to its symbol.
const COLOR_LABELS = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless" }

// colorCell shows a color's mana symbol and its name. Colorless uses the
// colorless symbol.
function colorCell(color) {
  let symbol = ColorImages([color])
  if (color === "C") {
    symbol = ColorImages([])
  }
  return <span className="removal-color-cell">{symbol} {COLOR_LABELS[color]}</span>
}

// medianText is a median coverage for its cell, or a dash for a color with
// no removal to measure.
function medianText(value) {
  if (value < 0) {
    return "—"
  }
  return `${value}%`
}

// RemovalByColor lists each color's spot removal. mode "played" shows
// play-weighted coverage; otherwise raw coverage over the cube's creatures.
export function RemovalByColor({ rows, mode }) {
  return (
    <SectionCard title="Removal by color">
      <table className="widget-table">
        <thead>
          <tr>
            <td className="header-cell">Color</td>
            <HoverInfo title="Cards" info="Spot-removal cards of this color. A multicolor card counts under each of its colors.">
              <td className="header-cell page-right-cell">Cards</td>
            </HoverInfo>
            <HoverInfo title="Median coverage" info="The middle card's share of creatures it can kill, using each card's best mode.">
              <td className="header-cell page-right-cell">Median coverage</td>
            </HoverInfo>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            let median = row.median_pct_cube
            if (mode === "played") {
              median = row.median_pct_played
            }
            return (
              <tr key={row.color} className="widget-table-row">
                <td>{colorCell(row.color)}</td>
                <td className="page-right-cell">{row.cards}</td>
                <td className="page-right-cell">{medianText(median)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </SectionCard>
  )
}
