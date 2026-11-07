// The heatmap of how each color group does against each other color group.

import React from 'react'
import { HoverStats } from "../../components/kit/HoverStats.js"
import { SectionCard } from "../../components/kit/SectionCard.js"
import { ColorImages } from "../../utils/Colors.js"
import { colorName } from "../../utils/colorNames.js"
import { goodBadTint } from "../tints.js"
import { cellShade, heatmapColorType, heatmapGroups, isShownCell, showsPairsInstead } from "./heatmapModel.js"
import { COLORS_COPY } from "./copy.js"
import "../stats.css"

// cellRows are a heatmap cell's popover rows: its record, with a meter naming
// both sides, then its raw win rate and that rate's interval.
function cellRows(myColor, oppColor, record) {
  const wins = record.wins
  const losses = record.losses
  const total = wins + losses
  const recordRow = {
    label: COLORS_COPY.heatmap.cellRecordLabel,
    value: COLORS_COPY.heatmap.cellRecord({ wins, losses, total }),
    share: wins / total,
    ends: [sideLabel(myColor), sideLabel(oppColor)],
  }
  return [
    recordRow,
    { label: COLORS_COPY.heatmap.rawLabel, value: `${Math.round(record.win_pct)}%` },
    { label: COLORS_COPY.heatmap.intervalLabel, value: `${Math.round(record.win_pct_low)}–${Math.round(record.win_pct_high)}%` },
  ]
}

// sideLabel is a color group's pips followed by its guild or shard name.
function sideLabel(colors) {
  return (
    <span className="stats-pop-side">
      {ColorImages(colors)}
      {colorName(colors)}
    </span>
  )
}

// MatchupCell is one pairing: the row group's Bayes win rate against the
// column group, tinted only when its interval leaves out 50%. Pairings with
// no games are blank.
function MatchupCell({ myColor, oppColor, record }) {
  if (!record || record.wins + record.losses === 0) {
    return <td className="colors-heatmap-cell" />
  }

  const shade = cellShade(record)
  let background = "var(--se-card)"
  if (shade !== 0) {
    background = goodBadTint(shade)
  }
  const footer = record.significant ? COLORS_COPY.heatmap.footerDifferent : COLORS_COPY.heatmap.footerSame
  const title = COLORS_COPY.heatmap.cellTitle({ mine: colorName(myColor), opponent: colorName(oppColor) })
  return (
    <HoverStats title={title} rows={cellRows(myColor, oppColor, record)} footer={footer}>
      <td className={shade === 0 ? "colors-heatmap-cell stats-muted" : "colors-heatmap-cell"} style={{ background }}>
        {Math.round(record.bayesian_win_pct)}%
      </td>
    </HoverStats>
  )
}

// ColorMatchupHeatmap shows how each color (or pair) does against each other,
// each pairing once. For Any and Trio it shows pairs, since three-color
// groups leave almost every cell with a handful of games.
export function ColorMatchupHeatmap({ matchupData, colorType }) {
  if (!matchupData || Object.keys(matchupData).length === 0) {
    return null
  }

  const groups = heatmapGroups(colorType)
  let title = COLORS_COPY.heatmap.pairTitle
  if (heatmapColorType(colorType) === "Mono") {
    title = COLORS_COPY.heatmap.monoTitle
  }

  let note = null
  if (showsPairsInstead(colorType)) {
    note = <p className="stats-muted-small colors-heatmap-note">{COLORS_COPY.heatmap.pairsInsteadNote}</p>
  }

  return (
    <SectionCard title={title}>
      {note}
      <p className="stats-muted-small colors-heatmap-note">{COLORS_COPY.heatmap.shadingNote}</p>
      <div className="stats-table-scroll">
        <table className="widget-table stats-table-compact colors-heatmap-table">
          <thead>
            <tr>
              <td className="header-cell colors-heatmap-corner"></td>
              {groups.map(group => (
                <td key={group} className="header-cell colors-heatmap-head">{colorName(group)}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((myColor, i) => (
              <tr key={myColor} className="widget-table-row">
                <td className="header-cell stats-bold">{colorName(myColor)}</td>
                {groups.map((oppColor, j) => {
                  if (!isShownCell(i, j)) {
                    return <td key={oppColor} className="heatmap-empty-cell" />
                  }
                  return <MatchupCell key={oppColor} myColor={myColor} oppColor={oppColor} record={matchupData[myColor]?.[oppColor]} />
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
