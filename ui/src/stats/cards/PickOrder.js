// The Pick order section: where each card tends to be picked in a draft.

import React from 'react'
import { SortFunc, CardImageURL } from "../../utils/Utils.js"
import { NumericInput } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"

// PickOrderSection shows per-card draft pick statistics aggregated across all
// drafts (how early each card tends to be taken, how often it's first-picked,
// how often it's burned). It holds its own sort and filter state so it doesn't
// depend on the Browse Drafts page where this table used to live.
export function PickOrderSection({ pickInfo }) {
  const [sortBy, setSortBy] = React.useState("p1p1");
  const [invertSort, setInvertSort] = React.useState(false);
  const [minDrafts, setMinDrafts] = React.useState(0);
  const [minDeviation, setMinDeviation] = React.useState(0);
  const [maxDeviation, setMaxDeviation] = React.useState(0);
  const [minAvgPick, setMinAvgPick] = React.useState(0);
  const [maxAvgPick, setMaxAvgPick] = React.useState(0);

  const onHeaderClick = (e) => {
    const id = e.currentTarget.id;
    if (sortBy === id) {
      setInvertSort(!invertSort);
    } else {
      setInvertSort(false);
      setSortBy(id);
    }
  };

  let pickList = [];
  for (let [, pick] of (pickInfo || new Map())) {
    pickList.push(pick);
  }

  let headers = [
    { id: "name", text: "Card name", tip: "The card's name." },
    { id: "count", text: "# Drafts", tip: "Number of drafts that have included this card." },
    { id: "p1p1", text: "# P1P1", tip: "Number of times this card has been selected pick 1 of pack 1." },
    { id: "avgp1pick", text: "Avg. p1 pick", tip: "Average pick, limited exclusively to instances where this card was present in pack #1." },
    { id: "avgpick", text: "Avg. pick", tip: "Average pick for this card within a pack (i.e., out of 15)." },
    { id: "avgpickabs", text: "Avg. pick (abs)", tip: "Average pick for this card across all packs (i.e., out of 45). Mostly silly, but fun to look at." },
    { id: "stddev", text: "Pick deviation", tip: "Pick order standard deviation. A higher number means this card has a higher variance in pick order." },
    { id: "p1burn", text: "# P1 Burns", tip: "For drafts that burn cards, the number of times this card was burned in pack #1." },
    { id: "burn", text: "# Burns", tip: "For drafts that burn cards, the number of times that this card was burned in total." },
  ];

  return (
    <div className="controls-panel">
      <div className="selector-group" style={{ justifyContent: "center" }}>
        <NumericInput label="Min dev" value={minDeviation} onChange={(e) => setMinDeviation(e.target.value)} />
        <NumericInput label="Max dev" value={maxDeviation} onChange={(e) => setMaxDeviation(e.target.value)} />
        <NumericInput label="Min drafts" value={minDrafts} onChange={(e) => setMinDrafts(e.target.value)} />
        <NumericInput label="Min avg" value={minAvgPick} onChange={(e) => setMinAvgPick(e.target.value)} />
        <NumericInput label="Max avg" value={maxAvgPick} onChange={(e) => setMaxAvgPick(e.target.value)} />
      </div>
      <div className="table-scroll" style={{ marginTop: "1rem" }}>
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              {headers.map((hdr) => (
                <HoverInfo key={hdr.id} title={hdr.text} info={hdr.tip}>
                  <td onClick={onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                </HoverInfo>
              ))}
            </tr>
          </thead>
          <tbody>
            {pickList.map(function (pick) {
              if (minDrafts > 0 && pick.count < minDrafts) {
                return
              }

              let avgPackPick = "-"
              let avgPackPickAbsolute = "-"
              if (pick.count > 0) {
                avgPackPick = Math.round(pick.pickNumSum / pick.count * 10) / 10
                avgPackPickAbsolute = Math.round(pick.pickNumSumAbs / pick.count * 10) / 10
              }

              if (minAvgPick > 0 && avgPackPick < minAvgPick) {
                return
              }
              if (maxAvgPick > 0 && avgPackPick > maxAvgPick) {
                return
              }

              let avgPack1Pick = "-"
              if (pick.p1Count > 0) {
                avgPack1Pick = Math.round(pick.p1PickNumSum / pick.p1Count * 100) / 100
              }

              let firstPicks = "-"
              if (pick.firstPicks > 0) {
                firstPicks = pick.firstPicks
              }

              let burns = "-"
              if (pick.burns > 0) {
                burns = pick.burns
              }

              let p1Burns = "-"
              if (pick.p1Burns > 0) {
                p1Burns = pick.p1Burns
              }

              let sumOfSquares = 0
              for (let p of pick.picks) {
                let diff = avgPackPick - p.pick
                sumOfSquares += diff * diff
              }
              let stddev = pick.count < 2 ? 0 : Math.round(Math.sqrt(sumOfSquares / (pick.count - 1)) * 10) / 10

              if (minDeviation > 0 && stddev < minDeviation) {
                return
              }
              if (maxDeviation > 0 && stddev > maxDeviation) {
                return
              }

              // Sort uses raw numeric data, not display strings. null means
              // "no data" and is translated to an end-of-list sentinel below.
              let sort = pick.count
              if (sortBy === "p1p1") {
                sort = pick.firstPicks
              } else if (sortBy === "avgp1pick") {
                sort = pick.p1Count > 0 ? pick.p1PickNumSum / pick.p1Count : null
              } else if (sortBy === "avgpick") {
                sort = pick.count > 0 ? pick.pickNumSum / pick.count : null
              } else if (sortBy === "avgpickabs") {
                sort = pick.count > 0 ? pick.pickNumSumAbs / pick.count : null
              } else if (sortBy === "burn") {
                sort = pick.burns
              } else if (sortBy === "p1burn") {
                sort = pick.p1Burns
              } else if (sortBy === "name") {
                sort = pick.name
              } else if (sortBy === "count") {
                sort = pick.count
              } else if (sortBy === "stddev") {
                sort = stddev
              }

              if (sort === null) {
                sort = invertSort ? 100000 : -1
              } else if (invertSort && typeof sort === "number") {
                sort = -1 * sort
              }

              return (
                <tr sort={sort} className="widget-table-row" key={pick.name}>
                  <HoverInfo title={pick.name} info={PickOrderTooltip(pick)} position="right">
                    <td><a href={pick.card.url} target="_blank" rel="noopener noreferrer">{pick.name}</a></td>
                  </HoverInfo>
                  <td>{pick.count}</td>
                  <td>{firstPicks}</td>
                  <td>{avgPack1Pick}</td>
                  <td>{avgPackPick}</td>
                  <td>{avgPackPickAbsolute}</td>
                  <td>{stddev}</td>
                  <td>{p1Burns}</td>
                  <td>{burns}</td>
                </tr>
              )
            }).sort(SortFunc)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// PickOrderTooltip lists every individual pick of a card across drafts.
function PickOrderTooltip(pick) {
  let k = 0
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "12px", alignItems: "flex-start" }}>
      <img
        src={CardImageURL(pick)}
        alt={pick.name}
        style={{ width: '200px', display: 'block', borderRadius: '8px', flexShrink: 0 }}
      />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
            <th style={{ padding: "4px 8px" }}>Date</th>
            <th style={{ padding: "4px 8px" }}>Player</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>Pack</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>Pick</th>
          </tr>
        </thead>
        <tbody>
          {pick.picks.map(function (p) {
            k += 1
            return (
              <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "4px 8px" }}>{p.date}</td>
                <td style={{ padding: "4px 8px" }}>{p.player}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{p.pack + 1}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{p.pick + 1}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
