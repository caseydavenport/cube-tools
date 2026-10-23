// The heatmap of how each color group does against each other color group.

import React from 'react'
import { HoverStats } from "../../components/kit/HoverStats.js"
import { ColorImages } from "../../utils/Colors.js"
import { goodBadTint } from "../tints.js"
import { COLORS_COPY } from "./copy.js"
import "../stats.css"

const monoColors = ["W", "U", "B", "R", "G"];

const dualColors = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"];

const trioColors = ["WUB", "WUR", "WUG", "WBR", "WBG", "WRG", "UBR", "UBG", "URG", "BRG"];

// cellRows is the record row of a heatmap cell's popover. With games played, a
// meter under it shows the share won, and names both sides: the row's color
// group on the left and its opponent on the right.
function cellRows(myColor, oppColor, wins, losses) {
  const total = wins + losses
  const row = {
    label: COLORS_COPY.heatmap.cellRecordLabel,
    value: COLORS_COPY.heatmap.cellRecord({ wins, losses, total }),
  }
  if (total > 0) {
    row.share = wins / total
    row.ends = [sideLabel(myColor), sideLabel(oppColor)]
  }
  return [row]
}

// sideLabel is a color group's pips followed by its guild or shard name.
function sideLabel(colors) {
  return (
    <span className="stats-pop-side">
      {ColorImages(colors)}
      {COLORS_COPY.heatmap.groupNames[colors] || colors}
    </span>
  )
}

export function ColorMatchupHeatmap({ matchupData, colorType }) {
  const [sortColumn, setSortColumn] = React.useState(null);

  if (!matchupData || Object.keys(matchupData).length === 0) {
    return null;
  }

  let groups = dualColors;
  if (colorType === "Mono") groups = monoColors;
  else if (colorType === "Trio") groups = trioColors;
  else if (colorType === "Any") groups = [...monoColors, ...dualColors, ...trioColors];

  // Sort rows by win% against the selected column, descending.
  let sortedRows = [...groups];
  if (sortColumn && groups.includes(sortColumn)) {
    sortedRows.sort((a, b) => {
      const aRecord = matchupData[a]?.[sortColumn];
      const bRecord = matchupData[b]?.[sortColumn];
      const aPct = aRecord ? aRecord.win_pct : -1;
      const bPct = bRecord ? bRecord.win_pct : -1;
      return bPct - aPct;
    });
  }

  // Compute cell background color: green for >50%, red for <50%, gray for mirror/low data.
  function cellColor(winPct, totalGames) {
    if (totalGames < 10) return "var(--se-card)";
    // Scale from bad (0%) through neutral (50%) to good (100%).
    return goodBadTint((winPct - 50) / 50);
  }

  let title = COLORS_COPY.heatmap.pairTitle;
  if (colorType === "Mono") title = COLORS_COPY.heatmap.monoTitle;
  else if (colorType === "Trio") title = COLORS_COPY.heatmap.trioTitle;

  return (
    <div>
      <h4 className="heatmap-title">
        {title}
      </h4>
      <div className="stats-table-scroll">
        <table className="widget-table stats-table-compact">
          <thead>
            <tr>
              <td className="header-cell colors-heatmap-corner"></td>
              {groups.map(cp => (
                <td key={cp} className="header-cell" style={{
                  textAlign: "center", minWidth: "65px", cursor: "pointer",
                  background: sortColumn === cp ? "var(--mantine-primary-color-filled)" : undefined,
                  color: sortColumn === cp ? "var(--se-page)" : undefined,
                }} onClick={() => setSortColumn(sortColumn === cp ? null : cp)}>
                  {COLORS_COPY.heatmap.groupNames[cp] || cp}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(myColor => (
              <tr key={myColor} className="widget-table-row">
                <td className="header-cell stats-bold">{COLORS_COPY.heatmap.groupNames[myColor] || myColor}</td>
                {groups.map(oppColor => {
                  if (myColor === oppColor) {
                    return (
                      <td key={oppColor} className="heatmap-empty-cell">
                        -
                      </td>
                    );
                  }
                  const record = matchupData[myColor]?.[oppColor];
                  const wins = record?.wins || 0;
                  const losses = record?.losses || 0;
                  const total = wins + losses;
                  const winPct = total > 0 ? record.win_pct : 0;

                  return (
                    <HoverStats key={oppColor} title={COLORS_COPY.heatmap.cellTitle({ mine: COLORS_COPY.heatmap.groupNames[myColor], opponent: COLORS_COPY.heatmap.groupNames[oppColor] })} rows={cellRows(myColor, oppColor, wins, losses)}>
                      <td style={{
                        background: cellColor(winPct, total),
                        textAlign: "center",
                        cursor: "default",
                        opacity: total < 10 ? 0.4 : 1,
                      }}>
                        {total > 0 ? `${Math.round(winPct)}%` : ""}
                      </td>
                    </HoverStats>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
