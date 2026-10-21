// The Pick order section: where each card tends to be picked in a draft.

import React from 'react'
import { SortFunc } from "../../utils/Utils.js"
import { NumericInput } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { HoverTable } from "../../components/kit/HoverTable.js"
import { CardPopBody } from "./CardTooltip.js"
import { CARDS_COPY } from "./copy.js"

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
    { id: "name", text: CARDS_COPY.pickOrder.cardName.text, tip: CARDS_COPY.pickOrder.cardName.tip },
    { id: "count", text: CARDS_COPY.pickOrder.drafts.text, tip: CARDS_COPY.pickOrder.drafts.tip },
    { id: "p1p1", text: CARDS_COPY.pickOrder.p1p1.text, tip: CARDS_COPY.pickOrder.p1p1.tip },
    { id: "avgp1pick", text: CARDS_COPY.pickOrder.avgP1Pick.text, tip: CARDS_COPY.pickOrder.avgP1Pick.tip },
    { id: "avgpick", text: CARDS_COPY.pickOrder.avgPick.text, tip: CARDS_COPY.pickOrder.avgPick.tip },
    { id: "avgpickabs", text: CARDS_COPY.pickOrder.avgPickAbs.text, tip: CARDS_COPY.pickOrder.avgPickAbs.tip },
    { id: "stddev", text: CARDS_COPY.pickOrder.pickDeviation.text, tip: CARDS_COPY.pickOrder.pickDeviation.tip },
    { id: "p1burn", text: CARDS_COPY.pickOrder.p1Burns.text, tip: CARDS_COPY.pickOrder.p1Burns.tip },
    { id: "burn", text: CARDS_COPY.pickOrder.burns.text, tip: CARDS_COPY.pickOrder.burns.tip },
  ];

  return (
    <div className="controls-panel">
      <div className="selector-group" style={{ justifyContent: "center" }}>
        <NumericInput label={CARDS_COPY.pickOrder.minDev} value={minDeviation} onChange={(e) => setMinDeviation(e.target.value)} />
        <NumericInput label={CARDS_COPY.pickOrder.maxDev} value={maxDeviation} onChange={(e) => setMaxDeviation(e.target.value)} />
        <NumericInput label={CARDS_COPY.pickOrder.minDrafts} value={minDrafts} onChange={(e) => setMinDrafts(e.target.value)} />
        <NumericInput label={CARDS_COPY.pickOrder.minAvg} value={minAvgPick} onChange={(e) => setMinAvgPick(e.target.value)} />
        <NumericInput label={CARDS_COPY.pickOrder.maxAvg} value={maxAvgPick} onChange={(e) => setMaxAvgPick(e.target.value)} />
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
                  <HoverInfo title={pick.name} info={<PickOrderTooltip pick={pick} />} position="right">
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
function PickOrderTooltip({ pick }) {
  const columns = [
    { key: "date", label: CARDS_COPY.pickOrder.date },
    { key: "player", label: CARDS_COPY.pickOrder.player },
    { key: "pack", label: CARDS_COPY.pickOrder.pack, align: "center" },
    { key: "pick", label: CARDS_COPY.pickOrder.pick, align: "center" },
  ]
  const rows = pick.picks.map(p => ({ date: p.date, player: p.player, pack: p.pack + 1, pick: p.pick + 1 }))

  return (
    <CardPopBody card={pick}>
      <HoverTable columns={columns} rows={rows} />
    </CardPopBody>
  )
}
