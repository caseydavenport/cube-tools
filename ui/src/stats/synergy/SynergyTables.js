// The Synergy tables: card pairs that do better together, and focal cards.

import React from 'react'
import { SortFunc } from "../../utils/Utils.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { hasData, visibleItems } from "../../utils/dataKinds.js"

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
    { id: "card1", text: "Card 1", tip: "First card in pair." },
    { id: "card2", text: "Card 2", tip: "Second card in pair." },
    { id: "winpercent", text: "Win %", tip: "Aggregate win % of decks with both.", needs: ["results"] },
    { id: "count", text: "#", tip: "Number of decks." },
    { id: "synergy", text: "Syn", tip: "Lift score. >1 = appears together more than expected." },
    { id: "saturation", text: "Sat", tip: "Realized fraction: how many of the rarer card's decks this pair filled (count / min plays of the two cards). High = the pair is near its co-occurrence ceiling; low = headroom left." },
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
              <td>{pair.synergy_score.toFixed(2)}x</td>
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
    { id: "card_name", text: "Card", tip: "Card Name" },
    { id: "focal_score", text: "Score", tip: "Sum of synergy scores for partners above the focal threshold. High = build-around card." },
    { id: "partners", text: "Top Partners", tip: "Cards that most frequently appear with this card." },
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
              <td style={{"fontSize": "0.85em", "color": "var(--text-muted)"}}>{stat.top_partners.join(", ")}</td>
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
  return "var(--text-muted)"
}
