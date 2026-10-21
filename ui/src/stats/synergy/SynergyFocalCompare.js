// Focal cards in winning decks compared with focal cards in losing decks.

import React, { useState } from 'react'
import { Scatter } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, withAlpha } from "../../theme/chartTheme.js"
import { cardDisplayColor, pointOutline } from "./synergyHelpers.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { ChartTitle } from "./synergyParts.js"
import { deltaTextColor } from "./SynergyTables.js"
import { SYNERGY_COPY } from "./copy.js"

// SynergyFocalCompare shows how each card's focal score (build-around hub strength)
// shifts between winning and losing decks: a scatter of losing focal (x) vs winning
// focal (y) around a y=x line, plus a sortable table. Click a card to select it.
export function SynergyFocalCompare({ synergyCompare, cube, onCardSelected }) {
  const [sortCol, setSortCol] = useState("delta");
  const [sortDir, setSortDir] = useState("desc");

  const winning = synergyCompare?.winning?.focal_stats || [];
  const losing = synergyCompare?.losing?.focal_stats || [];
  if (winning.length === 0 && losing.length === 0) {
    return null;
  }

  const colorMap = {};
  if (cube && cube.cards) {
    for (const c of cube.cards) colorMap[c.name] = c.colors;
  }

  const winPlay = synergyCompare?.winning?.card_play_counts || {};
  const losePlay = synergyCompare?.losing?.card_play_counts || {};
  const winMap = new Map(winning.map(s => [s.card_name, s.focal_score]));
  const loseMap = new Map(losing.map(s => [s.card_name, s.focal_score]));

  // Keep cards played in both pools that are a hub (focal > 0) in at least one.
  // A card absent from a pool isn't useful, and a hub nowhere is just a staple. A
  // played card scoring 0 focal stays on purpose - that's a card seeing play
  // without forming synergy, which is the signal we want.
  const names = Object.keys(winPlay)
    .filter(n => losePlay[n] > 0)
    .filter(n => (winMap.get(n) || 0) > 0 || (loseMap.get(n) || 0) > 0);
  const rows = names.map(name => {
    const win = winMap.get(name) || 0;
    const lose = loseMap.get(name) || 0;
    return { name, win, lose, delta: win - lose, winDecks: winPlay[name] || 0, loseDecks: losePlay[name] || 0 };
  });

  const max = Math.max(1, ...rows.map(r => Math.max(r.win, r.lose)));
  const points = rows.map(r => ({ x: r.lose, y: r.win, name: r.name, win: r.win, lose: r.lose, delta: r.delta, winDecks: r.winDecks, loseDecks: r.loseDecks }));

  const data = {
    datasets: [{
      label: SYNERGY_COPY.focalCompare.datasetLabel,
      data: points,
      pointBackgroundColor: points.map(p => cardDisplayColor(colorMap[p.name])),
      pointBorderColor: pointOutline(),
      pointRadius: 5,
      pointHoverRadius: 8,
    }],
  };

  // Dashed y=x reference line: same focal role in winning and losing decks.
  const diagonalLine = {
    id: "diagonalLine",
    afterDatasetsDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.strokeStyle = withAlpha(currentChartTheme().text, 0.4);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(scales.x.getPixelForValue(0), scales.y.getPixelForValue(0));
      ctx.lineTo(scales.x.getPixelForValue(max), scales.y.getPixelForValue(max));
      ctx.stroke();
      ctx.restore();
    },
  };

  const axis = (text) => ({
    min: 0,
    max: max * 1.05,
    title: { display: true, text, font: { size: 14 } },
  });

  const options = {
    maintainAspectRatio: false,
    onClick: (e, elements) => {
      if (elements.length > 0 && onCardSelected) {
        const p = points[elements[0].index];
        onCardSelected({ currentTarget: { id: p.name } });
      }
    },
    scales: {
      x: axis(SYNERGY_COPY.focalCompare.xAxisTitle),
      y: axis(SYNERGY_COPY.focalCompare.yAxisTitle),
    },
    plugins: {
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: {
          label: (item) => {
            const p = points[item.dataIndex];
            const dir = p.delta > 0 ? SYNERGY_COPY.focalCompare.tooltipWinning : p.delta < 0 ? SYNERGY_COPY.focalCompare.tooltipLosing : SYNERGY_COPY.focalCompare.tooltipEven;
            return SYNERGY_COPY.focalCompare.tooltipLabel({
              name: p.name,
              win: p.win.toFixed(1),
              winDecks: p.winDecks,
              lose: p.lose.toFixed(1),
              loseDecks: p.loseDecks,
              sign: p.delta >= 0 ? "+" : "",
              delta: p.delta.toFixed(1),
              dir: dir,
            });
          },
        },
      }),
    },
  };

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol];
    const bv = b[sortCol];
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const onHeader = (col) => {
    if (col === sortCol) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };
  const headers = [
    { id: "name", text: SYNERGY_COPY.focalCompare.headerCard },
    { id: "win", text: SYNERGY_COPY.focalCompare.headerWinning, tip: SYNERGY_COPY.focalCompare.headerWinningTip },
    { id: "lose", text: SYNERGY_COPY.focalCompare.headerLosing, tip: SYNERGY_COPY.focalCompare.headerLosingTip },
    { id: "delta", text: SYNERGY_COPY.focalCompare.headerDelta, tip: SYNERGY_COPY.focalCompare.headerDeltaTip },
  ];

  return (
    <div style={{marginTop: "1.5rem"}}>
      <ChartTitle title={SYNERGY_COPY.focalCompare.title} description={SYNERGY_COPY.focalCompare.description} />
      <div className="synergy-pair-grid">
        <div style={{width: "min(600px, 100%)", aspectRatio: "1 / 1", margin: "0 auto"}}>
          <Scatter options={options} data={data} plugins={[diagonalLine]} />
        </div>
        <div className="widget-scroll">
          <table className="widget-table">
            <thead className="table-header">
              <tr><td colSpan="4" className="header-cell" style={{textAlign: "center", fontWeight: "bold", background: "var(--mantine-primary-color-filled)", color: "var(--se-page)"}}>{SYNERGY_COPY.focalCompare.tableTitle}</td></tr>
              <tr>
                {headers.map((hdr, i) => {
                  const cell = (
                    <td key={i} className="header-cell" style={{cursor: "pointer"}} onClick={() => onHeader(hdr.id)}>
                      {hdr.text}{sortCol === hdr.id ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </td>
                  );
                  if (!hdr.tip) {
                    return cell;
                  }
                  return <HoverInfo key={i} title={hdr.text} info={hdr.tip}>{cell}</HoverInfo>;
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr className="widget-table-row" key={i}>
                  <td onClick={onCardSelected} id={r.name}>{r.name}</td>
                  <td>{r.win.toFixed(2)}</td>
                  <td>{r.lose.toFixed(2)}</td>
                  <td style={{color: deltaTextColor(r.delta)}}>{r.delta >= 0 ? "+" : ""}{r.delta.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
