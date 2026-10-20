// The heatmap of how each color group does against each other color group.

import React from 'react'
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { goodBadTint } from "../tints.js"

const monoColors = ["W", "U", "B", "R", "G"];

const dualColors = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"];

const trioColors = ["WUB", "WUR", "WUG", "WBR", "WBG", "WRG", "UBR", "UBG", "URG", "BRG"];

const colorGroupNames = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
  WU: "Azorius", WB: "Orzhov", WR: "Boros", WG: "Selesnya",
  UB: "Dimir", UR: "Izzet", UG: "Simic", BR: "Rakdos", BG: "Golgari", RG: "Gruul",
  WUB: "Esper", WUR: "Jeskai", WUG: "Bant", WBR: "Mardu", WBG: "Abzan",
  WRG: "Naya", UBR: "Grixis", UBG: "Sultai", URG: "Temur", BRG: "Jund",
};

export function ColorMatchupHeatmap({ matchupData, colorType }) {
  const [sortColumn, setSortColumn] = React.useState(null);

  if (!matchupData || Object.keys(matchupData).length === 0) {
    return null;
  }

  let groups = dualColors;
  if (colorType === "Mono") groups = monoColors;
  else if (colorType === "Trio") groups = trioColors;

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
    if (totalGames < 10) return "var(--card-background)";
    // Scale from bad (0%) through neutral (50%) to good (100%).
    return goodBadTint((winPct - 50) / 50);
  }

  const title = colorType === "Mono" ? "Mono-Color" : colorType === "Trio" ? "Trio-Color" : "Color Pair";

  return (
    <div>
      <h4 style={{textAlign: "center", color: "var(--primary)", marginBottom: "1rem"}}>
        {title} Matchup Heatmap
      </h4>
      <div style={{overflowX: "auto"}}>
        <table className="widget-table" style={{margin: "0 auto", fontSize: "0.85em"}}>
          <thead>
            <tr>
              <td className="header-cell" style={{minWidth: "70px"}}></td>
              {groups.map(cp => (
                <td key={cp} className="header-cell" style={{
                  textAlign: "center", minWidth: "65px", cursor: "pointer",
                  background: sortColumn === cp ? "var(--primary)" : undefined,
                  color: sortColumn === cp ? "var(--page-background)" : undefined,
                }} onClick={() => setSortColumn(sortColumn === cp ? null : cp)}>
                  {colorGroupNames[cp] || cp}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(myColor => (
              <tr key={myColor} className="widget-table-row">
                <td className="header-cell" style={{fontWeight: "bold"}}>{colorGroupNames[myColor] || myColor}</td>
                {groups.map(oppColor => {
                  if (myColor === oppColor) {
                    return (
                      <td key={oppColor} style={{background: "var(--page-background)", textAlign: "center", color: "var(--text-muted)"}}>
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
                    <HoverInfo key={oppColor} title={<>{colorGroupNames[myColor]} vs {colorGroupNames[oppColor]}</>} info={<>{wins}W - {losses}L ({total} games)</>}>
                      <td style={{
                        background: cellColor(winPct, total),
                        textAlign: "center",
                        cursor: "default",
                        opacity: total < 10 ? 0.4 : 1,
                      }}>
                        {total > 0 ? `${Math.round(winPct)}%` : ""}
                      </td>
                    </HoverInfo>
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
