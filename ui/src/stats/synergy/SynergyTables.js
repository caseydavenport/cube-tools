// The Synergy tables: card pairs that do better together, and focal cards.

import React from 'react'
import { SortFunc } from "../../utils/Utils.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { hasData, visibleItems } from "../../utils/dataKinds.js"
import { SYNERGY_COPY } from "./copy.js"

function sortValue(sortBy, pair) {
  switch (sortBy) {
    case "card1": return pair.card1
    case "card2": return pair.card2
    case "count": return pair.count
    case "synergy": return pair.synergy_score
    case "saturation": return pair.saturation
    case "winpercent": return pair.win_percent
    default: return pair.synergy_score
  }
}

export function SynergyWidgetTable(input) {
  let pairs = input.synergyData.pairs || []
  let headers = visibleItems([
    { id: "card1", text: SYNERGY_COPY.tables.pairCard1, tip: SYNERGY_COPY.tables.pairCard1Tip },
    { id: "card2", text: SYNERGY_COPY.tables.pairCard2, tip: SYNERGY_COPY.tables.pairCard2Tip },
    { id: "winpercent", text: SYNERGY_COPY.tables.pairWinPercent, tip: SYNERGY_COPY.tables.pairWinPercentTip, needs: ["results"] },
    { id: "count", text: SYNERGY_COPY.tables.pairCount, tip: SYNERGY_COPY.tables.pairCountTip },
    { id: "synergy", text: SYNERGY_COPY.tables.pairSynergy, tip: SYNERGY_COPY.tables.pairSynergyTip },
    { id: "saturation", text: SYNERGY_COPY.tables.pairSaturation, tip: SYNERGY_COPY.tables.pairSaturationTip },
  ], input.info)
  const showWinPercent = hasData(input.info, "results")

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr>
          {headers.map((hdr, i) => (
            <HoverInfo key={i} title={hdr.text} info={hdr.tip}>
              <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
            </HoverInfo>
          ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, i) => (
            <tr className="widget-table-row" sort={sortValue(input.sortBy, pair)} key={i}>
              <td id={pair.card1} onClick={input.onCardSelected}>{pair.card1}</td>
              <td id={pair.card2} onClick={input.onCardSelected}>{pair.card2}</td>
              <WinPercentCell pair={pair} show={showWinPercent} />
              <td>{pair.count}</td>
              <td>{pair.synergy_score.toFixed(2)}{SYNERGY_COPY.tables.liftSuffix}</td>
              <td>{pair.saturation != null ? `${Math.round(pair.saturation * 100)}%` : ""}</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}

// WinPercentCell is a pair's win rate, left out on cubes without results.
function WinPercentCell({ pair, show }) {
  if (!show) {
    return null
  }
  return <td>{pair.win_percent.toFixed(0)}%</td>
}

export function FocalPointsTable(input) {
  let stats = input.synergyData.focal_stats || []
  let headers = [
    { id: "card_name", text: SYNERGY_COPY.tables.focalCard, tip: SYNERGY_COPY.tables.focalCardTip },
    { id: "focal_score", text: SYNERGY_COPY.tables.focalScore, tip: SYNERGY_COPY.tables.focalScoreTip },
    { id: "partners", text: SYNERGY_COPY.tables.focalPartners, tip: SYNERGY_COPY.tables.focalPartnersTip },
  ]

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            {headers.map((hdr, i) => (
              <HoverInfo key={i} title={hdr.text} info={hdr.tip}>
                <td className="header-cell">{hdr.text}</td>
              </HoverInfo>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((stat, i) => (
            <tr className="widget-table-row" sort={stat.focal_score} key={i}>
              <td onClick={input.onCardSelected} id={stat.card_name}>{stat.card_name}</td>
              <td>{stat.focal_score.toFixed(2)}</td>
              <td style={{"fontSize": "0.85em", "color": "var(--se-muted)"}}>{stat.top_partners.join(", ")}</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}

// deltaTextColor colors a change: good when it rose, bad when it fell, muted
// when it held still.
export function deltaTextColor(delta) {
  if (delta > 0) {
    return "var(--se-good)"
  }
  if (delta < 0) {
    return "var(--se-bad)"
  }
  return "var(--se-muted)"
}
