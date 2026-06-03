import React, { useRef, useEffect, useCallback, useState } from 'react'
import { SortFunc } from "../utils/Utils.js"
import { NumericInput, Checkbox, DropdownHeader } from "../components/Dropdown.js"
import { White, Blue, Black, Red, Green } from "../utils/Colors.js"
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import { Scatter } from 'react-chartjs-2';
import { Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend, Title } from 'chart.js';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend, Title);

// Display color for a card based on its MTG color identity. Shared by the
// network graph and the popularity/synergy scatter.
function cardDisplayColor(colors) {
  if (!colors || colors.length === 0) return "#aaa"; // colorless
  if (colors.length > 1) return "#daa520"; // multicolor gold
  switch (colors[0]) {
    case "W": return White;
    case "U": return Blue;
    case "B": return Black;
    case "R": return Red;
    case "G": return Green;
    default: return "#aaa";
  }
}

export function SynergyWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <div className="synergy-container" style={{"padding": "1rem"}}>
      <SynergyWidgetOptions {...input} />
      <div style={{"marginTop": "1rem", "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "2rem", "alignItems": "start"}}>
        <SynergyNetworkGraph
          synergyData={input.synergyData}
          cube={input.cube}
          onCardSelected={input.onCardSelected}
        />
        <SynergyScatter
          synergyData={input.synergyData}
          cube={input.cube}
          onCardSelected={input.onCardSelected}
        />
      </div>
      <div className="synergy-grid" style={{"marginTop": "1rem", "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "2rem"}}>
        <SynergyWidgetTable {...input} />
        <FocalPointsTable {...input} />
      </div>
      <SynergyFocalCompare
        synergyCompare={input.synergyCompare}
        cube={input.cube}
        onCardSelected={input.onCardSelected}
      />
    </div>
  );
}

function OptionTooltip({ id, header, tip, children }) {
  return (
    <OverlayTrigger placement="bottom" delay={{ show: 100, hide: 100 }} overlay={
      <Popover id={id}><Popover.Header as="h3">{header}</Popover.Header><Popover.Body>{tip}</Popover.Body></Popover>
    }>
      <div>{children}</div>
    </OverlayTrigger>
  );
}

function SynergyWidgetOptions(input) {
  let pairs = input.synergyData.pairs || []
  return (
    <div className="scroll-container-large-header" style={{"width": "100%", "margin": "0"}}>
      <div className="selector-group">
        <div className="selection-cell">
          Showing top {pairs.length} synergistic pairs
        </div>
        <OptionTooltip id="tip-min-decks" header="Min Decks" tip="Minimum co-occurrences to include a pair.">
          <NumericInput
            label="Min decks"
            value={input.minSynergyDecks}
            onChange={input.onMinSynergyDecksChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-focal" header="Focal Threshold" tip="Min synergy score for a partner to count toward focal score.">
          <NumericInput
            label="Focal threshold"
            value={input.focalThreshold}
            onChange={input.onFocalThresholdChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-smoothing" header="Smoothing K" tip="Dampens noisy scores from low-sample pairs. Higher K = more conservative. 0 = no smoothing.">
          <NumericInput
            label="Smoothing K"
            value={input.smoothingK}
            onChange={input.onSmoothingKChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-color-adjust" header="Color Adjust" tip="Adjust expected co-occurrence for color bias. When on, same-color pairs are compared against decks that could cast both cards, preventing inflated scores.">
          <Checkbox
            text="Color adjust"
            checked={input.colorAdjust}
            onChange={input.onColorAdjustChanged}
          />
        </OptionTooltip>
        <OptionTooltip id="tip-record" header="Deck Record" tip="Restrict the source decks by match record. 'Winning' keeps decks that went 2-1 or better, 'losing' keeps 1-2 or worse. Compare the two to see which cards rise or fall between winning and losing decks.">
          <DropdownHeader
            label="Record"
            value={input.record}
            options={[{ label: "All decks", value: "all" }, { label: "Winning (2-1+)", value: "winning" }, { label: "Losing (1-2-)", value: "losing" }]}
            onChange={input.onRecordChanged}
          />
        </OptionTooltip>
      </div>
    </div>
  );
}

function sortValue(sortBy, pair) {
  switch (sortBy) {
    case "card1": return pair.card1
    case "card2": return pair.card2
    case "count": return pair.count
    case "synergy": return pair.synergy_score
    case "winpercent": return pair.win_percent
    default: return pair.synergy_score
  }
}

function SynergyWidgetTable(input) {
  let pairs = input.synergyData.pairs || []
  let headers = [
    { id: "card1", text: "Card 1", tip: "First card in pair." },
    { id: "card2", text: "Card 2", tip: "Second card in pair." },
    { id: "winpercent", text: "Win %", tip: "Aggregate win % of decks with both." },
    { id: "count", text: "#", tip: "Number of decks." },
    { id: "synergy", text: "Syn", tip: "Lift score. >1 = appears together more than expected." },
  ]

  return (
    <div className="widget-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr><td colSpan="5" className="header-cell" style={{"textAlign": "center", "fontWeight": "bold", "background": "var(--primary)", "color": "var(--page-background)"}}>Synergistic Pairs</td></tr>
          <tr>
          {headers.map((hdr, i) => (
            <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }} overlay={<Popover id="popover-basic"><Popover.Header as="h3">{hdr.text}</Popover.Header><Popover.Body>{hdr.tip}</Popover.Body></Popover>}>
              <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
            </OverlayTrigger>
          ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, i) => (
            <tr className="widget-table-row" sort={sortValue(input.sortBy, pair)} key={i}>
              <td id={pair.card1} onClick={input.onCardSelected}>{pair.card1}</td>
              <td id={pair.card2} onClick={input.onCardSelected}>{pair.card2}</td>
              <td>{pair.win_percent.toFixed(0)}%</td>
              <td>{pair.count}</td>
              <td>{pair.synergy_score.toFixed(2)}x</td>
            </tr>
          )).sort(SortFunc)}
        </tbody>
      </table>
    </div>
  );
}

function FocalPointsTable(input) {
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
          <tr><td colSpan="3" className="header-cell" style={{"textAlign": "center", "fontWeight": "bold", "background": "var(--primary)", "color": "var(--page-background)"}}>Archetype Focal Points</td></tr>
          <tr>
            {headers.map((hdr, i) => (
              <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }} overlay={<Popover id="popover-basic"><Popover.Header as="h3">{hdr.text}</Popover.Header><Popover.Body>{hdr.tip}</Popover.Body></Popover>}>
                <td className="header-cell">{hdr.text}</td>
              </OverlayTrigger>
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

// SynergyFocalCompare shows how each card's focal score (build-around hub strength)
// shifts between winning and losing decks: a scatter of losing focal (x) vs winning
// focal (y) around a y=x line, plus a sortable table. Click a card to select it.
function SynergyFocalCompare({ synergyCompare, cube, onCardSelected }) {
  const [sortCol, setSortCol] = useState("delta");
  const [sortDir, setSortDir] = useState("desc");

  const winning = synergyCompare?.winning?.focal_stats || [];
  const losing = synergyCompare?.losing?.focal_stats || [];
  if (winning.length === 0 && losing.length === 0) {
    return null;
  }

  const colorMap = {};
  if (cube && cube.cards) {
    for (const c of cube.cards) colorMap[c.name] = c.colors || [];
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
      label: "Cards",
      data: points,
      pointBackgroundColor: points.map(p => cardDisplayColor(colorMap[p.name])),
      pointBorderColor: "rgba(0,0,0,0.4)",
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
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
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
    title: { display: true, text, color: "#FFF", font: { size: 14 } },
    ticks: { color: "#FFF" },
    grid: { color: "rgba(255,255,255,0.08)" },
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
      x: axis("Focal score in losing decks"),
      y: axis("Focal score in winning decks"),
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => {
            const p = points[item.dataIndex];
            const dir = p.delta > 0 ? "winning" : p.delta < 0 ? "losing" : "even";
            return `${p.name}: focal ${p.win.toFixed(1)} winning (${p.winDecks} decks) / ${p.lose.toFixed(1)} losing (${p.loseDecks} decks), Δ ${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(1)} leans ${dir}`;
          },
        },
      },
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
    { id: "name", text: "Card" },
    { id: "win", text: "Winning" },
    { id: "lose", text: "Losing" },
    { id: "delta", text: "Δ (W-L)" },
  ];

  return (
    <div style={{marginTop: "1.5rem"}}>
      <h4 style={{color: "var(--primary)", marginBottom: "0.5rem", textAlign: "center"}}>Focal Score: Winning vs Losing</h4>
      <p style={{color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "0.5rem", textAlign: "center"}}>
        How each card's focal score (build-around hub strength) shifts between winning and losing decks. Only cards played in both pools are shown; a card sitting on an axis at 0 was played in that pool but formed no significant synergy there (which is itself signal), not absent from it. Points above the dashed line are bigger hubs in winning decks, below it bigger hubs in losing decks, on it the same role in both. Focal scores run lower in each sliced pool than in the full set (fewer decks clear the min-decks pair threshold), so lower the synergy min-decks slider to fill the comparison in. Hover for the deck counts behind each score. Click a card in the plot or table to select it.
      </p>
      <div className="synergy-grid" style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start"}}>
        <div style={{width: "min(600px, 100%)", aspectRatio: "1 / 1", margin: "0 auto"}}>
          <Scatter options={options} data={data} plugins={[diagonalLine]} />
        </div>
        <div className="widget-scroll">
          <table className="widget-table">
            <thead className="table-header">
              <tr><td colSpan="4" className="header-cell" style={{textAlign: "center", fontWeight: "bold", background: "var(--primary)", color: "var(--page-background)"}}>Winning vs Losing Focal</td></tr>
              <tr>
                {headers.map((hdr, i) => (
                  <td key={i} className="header-cell" style={{cursor: "pointer"}} onClick={() => onHeader(hdr.id)}>
                    {hdr.text}{sortCol === hdr.id ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr className="widget-table-row" key={i}>
                  <td onClick={onCardSelected} id={r.name}>{r.name}</td>
                  <td>{r.win.toFixed(2)}</td>
                  <td>{r.lose.toFixed(2)}</td>
                  <td style={{color: r.delta > 0 ? "#7ad17a" : r.delta < 0 ? "#d17a7a" : "var(--text-muted)"}}>{r.delta >= 0 ? "+" : ""}{r.delta.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// SynergyScatter plots cards with statistically significant synergy by how often
// they're played (x) against their average partner lift (y). Cards below the
// chance noise floor (avg lift 1.75) are dropped, so the bottom "low synergy"
// classes (goodstuff staples, filler) fall away and what's left splits left/right:
// low play = niche build-arounds, high play = established archetype cores.
// Reference lines sit at the medians of the surviving cards.
function SynergyScatter({ synergyData, cube, onCardSelected }) {
  const stats = synergyData?.focal_stats || [];
  const totalDecks = synergyData?.total_decks || 0;
  if (stats.length === 0 || totalDecks === 0) {
    return null;
  }

  const K = 5;

  // Derive the noise floor from this pool's own prior (the mean lift we shrink
  // toward) instead of hardcoding it: the floor sits a fixed fraction above the
  // prior, ~1.6% (full pool prior ~1.723, null-shuffle p95 ~1.75). A sliced pool
  // shifts the prior, so the floor has to track it - a fixed 1.75 emptied the
  // winning pool, whose prior drops below it.
  const NOISE_FLOOR_MARGIN = 1.75 / 1.723;

  // Avg partner lift is a mean over a card's qualifying partners, so a card with
  // one strong partner is as noisy as a card opened in a single draft. The
  // qualifying-partner count is focal_score / avg_partner_lift (focal_score is the
  // sum of those lifts, avg is the mean). Shrink the avg toward the pooled field
  // mean with the same K pseudo-count used for play rate, so single-partner cards
  // don't sit as high as well-supported ones. Note the per-pair lift is already
  // shrunk toward 1.0 at the edge level; this is a second, aggregate-level shrink
  // of the card's average toward the field mean.
  const lifted = stats.filter(s => s.avg_partner_lift > 0);
  const totalLiftSum = lifted.reduce((acc, s) => acc + s.focal_score, 0);
  const totalPartners = lifted.reduce((acc, s) => acc + s.focal_score / s.avg_partner_lift, 0);
  const priorLift = totalPartners > 0 ? totalLiftSum / totalPartners : 0;
  const shrinkLift = (s) => {
    if (s.avg_partner_lift <= 0) return 0;
    const partners = s.focal_score / s.avg_partner_lift;
    return (s.focal_score + K * priorLift) / (partners + K);
  };

  // Keep cards above the pool's chance noise floor (below it isn't distinguishable
  // from chance, just clutter). A sliced pool can have too few clear it, leaving the
  // scatter blank, so when fewer than MIN_POINTS do, fall back to the top MIN_POINTS
  // by lift and flag the sub-floor ones as context.
  const MIN_POINTS = 8;
  const noiseFloor = priorLift * NOISE_FLOOR_MARGIN;
  const ranked = stats
    .filter(s => s.avg_partner_lift > 0)
    .map(s => ({ stat: s, lift: shrinkLift(s) }))
    .sort((a, b) => b.lift - a.lift);
  const aboveFloor = ranked.filter(r => r.lift >= noiseFloor);
  const usingFallback = aboveFloor.length < MIN_POINTS;
  const shown = usingFallback ? ranked.slice(0, MIN_POINTS) : aboveFloor;
  if (shown.length === 0) {
    return null;
  }

  const colorMap = {};
  if (cube && cube.cards) {
    for (const card of cube.cards) colorMap[card.name] = card.colors || [];
  }

  // Play rate is a binomial proportion (maindecked / opened), so cards opened in
  // only a draft or two land at 0% or 100% on tiny samples and stretch the axis.
  // Shrink each rate toward the pooled mean with the same K pseudo-count: a
  // low-sample card sits near the field average and only earns an extreme position
  // once it has the opened drafts to back it up.
  const totalPlayed = shown.reduce((acc, r) => acc + r.stat.played_drafts, 0);
  const totalOpened = shown.reduce((acc, r) => acc + (r.stat.opened_drafts || 0), 0);
  const priorRate = totalOpened > 0 ? totalPlayed / totalOpened : 0;

  const points = shown.map(({ stat: s, lift }) => {
    // Play rate = drafts where the card was maindecked / drafts where it was
    // opened (seen in any mainboard, sideboard or pool). This is a singleton cube
    // drafted by 2-8 players, so scoping to drafts where the card was actually
    // opened avoids penalizing it for small drafts that never put it in a pack.
    const opened = s.opened_drafts || 0;
    const shrunk = (s.played_drafts + K * priorRate) / (opened + K);
    const rawDenom = opened > 0 ? opened : (s.played_drafts || 1);
    return {
      x: shrunk * 100,
      y: lift,
      name: s.card_name,
      deckCount: s.deck_count,
      playedDrafts: s.played_drafts,
      openedDrafts: s.opened_drafts,
      rawRate: (s.played_drafts / rawDenom) * 100,
      rawLift: s.avg_partner_lift,
      focalScore: s.focal_score,
      belowFloor: lift < noiseFloor,
    };
  });

  const median = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const medX = median(xs);
  const medY = median(ys);

  // Fit the y-axis tightly to the data range so the points spread out instead of
  // clustering near the center. Cards pile up against the hard noise floor at the
  // bottom, so give the lower end extra padding to keep them off the axis line.
  const fit = (vals, loFrac, hiFrac) => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const range = (hi - lo) || 1;
    return [lo - range * loFrac, hi + range * hiFrac];
  };
  const [yMin, yMax] = fit(ys, 0.18, 0.05);

  // Anchor the x-axis at zero so play rate distances are honest (a point twice
  // as far right really is played twice as often), ending just past the most-
  // played card rather than the full 0-100% that would crush everything left.
  const xMin = 0;
  const xMax = Math.max(...xs) * 1.05;

  const data = {
    datasets: [{
      label: "Cards",
      data: points,
      // Below-floor cards (only shown in the fallback) render as hollow rings so
      // they read as context rather than as cards that cleared the noise floor.
      pointBackgroundColor: points.map(p => p.belowFloor ? "transparent" : cardDisplayColor(colorMap[p.name])),
      pointBorderColor: points.map(p => p.belowFloor ? cardDisplayColor(colorMap[p.name]) : "rgba(0,0,0,0.4)"),
      pointBorderWidth: points.map(p => p.belowFloor ? 1.5 : 1),
      pointRadius: points.map(p => p.belowFloor ? 4 : 5),
      pointHoverRadius: 8,
    }],
  };

  // Draw the median crosshairs that bound the four quadrants. Drawn solid and
  // bright so the quadrant boundaries are unmistakable.
  const medianLines = {
    id: "medianLines",
    afterDatasetsDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const px = scales.x.getPixelForValue(medX);
      const py = scales.y.getPixelForValue(medY);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, chartArea.top);
      ctx.lineTo(px, chartArea.bottom);
      ctx.moveTo(chartArea.left, py);
      ctx.lineTo(chartArea.right, py);
      ctx.stroke();
      ctx.restore();
    },
  };

  const options = {
    maintainAspectRatio: false,
    onClick: (e, elements) => {
      if (elements.length > 0 && onCardSelected) {
        const p = points[elements[0].index];
        onCardSelected({ currentTarget: { id: p.name } });
      }
    },
    scales: {
      x: {
        min: xMin,
        max: xMax,
        title: { display: true, text: "Play rate (% of drafts opened, shrunk)", color: "#FFF", font: { size: 14 } },
        ticks: { color: "#FFF" },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
      y: {
        min: yMin,
        max: yMax,
        title: { display: true, text: "Avg partner lift (synergy intensity, shrunk)", color: "#FFF", font: { size: 14 } },
        ticks: { color: "#FFF" },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => {
            const p = points[item.dataIndex];
            const flag = p.belowFloor ? " [below noise floor]" : "";
            return `${p.name}${flag}: maindecked ${p.playedDrafts}/${p.openedDrafts} drafts opened (${p.rawRate.toFixed(1)}% raw, ${p.x.toFixed(1)}% adj), avg lift ${p.rawLift.toFixed(2)} raw / ${p.y.toFixed(2)} adj, focal ${p.focalScore.toFixed(1)}`;
          },
        },
      },
    },
  };

  return (
    <div style={{textAlign: "center"}}>
      <h4 style={{color: "var(--primary)", marginBottom: "0.5rem"}}>Popularity vs Synergy</h4>
      <p style={{color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "0.5rem"}}>
        {usingFallback
          ? `Only ${aboveFloor.length} of ${stats.length} cards clear this pool's chance noise floor (avg lift ≥ ${noiseFloor.toFixed(2)}), so the top ${shown.length} by synergy intensity are shown; hollow points sit below the floor and aren't distinguishable from chance.`
          : `The ${aboveFloor.length} cards whose average partner lift clears this pool's chance noise floor (avg lift ≥ ${noiseFloor.toFixed(2)}), of ${stats.length} total.`}
        {" "}Plotted by play rate (x) and average partner lift (y), colored by color identity. Play rate is how often the card was maindecked among the drafts where it was actually opened (in any mainboard, sideboard or pool), so it isn't penalized for drafts that predate it or never put it in a pack. Rates are shrunk toward the field average so cards opened only a draft or two don't get parked at 0% or 100% on a tiny sample (hover for the raw rate). Avg lift measures synergy intensity per partner, so it doesn't just reward popular cards; it's shrunk the same way so a card carried by a single strong partner doesn't rank as high as one backed by many. Left = niche build-arounds (rarely played but very synergistic), right = archetype cores (popular and synergistic). The crosshair lines mark the medians. Click a point to select.
      </p>
      <div style={{width: "min(600px, 100%)", aspectRatio: "1 / 1", margin: "0 auto"}}>
        <Scatter options={options} data={data} plugins={[medianLines]} />
      </div>
    </div>
  );
}

function SynergyNetworkGraph({ synergyData, cube, onCardSelected }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const nodeIndexRef = useRef({});
  const animRef = useRef(null);
  const dragRef = useRef(null);
  const hoveredRef = useRef(null);
  const drawRef = useRef(null);

  // Build a color lookup from cube cards.
  const cardColorMap = useCallback(() => {
    const map = {};
    if (cube && cube.cards) {
      for (const card of cube.cards) {
        map[card.name] = card.colors || [];
      }
    }
    return map;
  }, [cube]);

  // Get a display color for a card based on its MTG colors.
  function getNodeColor(colors) {
    return cardDisplayColor(colors);
  }

  useEffect(() => {
    const pairs = synergyData?.pairs || [];
    const focalStats = synergyData?.focal_stats || [];
    if (pairs.length === 0 || focalStats.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const colorMap = cardColorMap();

    // Primary nodes are the top focal-score cards. Satellites are the cards they
    // synergize with that didn't themselves make the focal cut - we pull these onto
    // the graph (gray) so a high-focal card never floats unconnected, and so you can
    // see whether its partners are other hubs (flexible) or niche cards (parasitic).
    const focalByName = {};
    for (const s of focalStats) focalByName[s.card_name] = s.focal_score;

    const topCards = focalStats.slice(0, 60);
    const primarySet = new Set(topCards.map(s => s.card_name));

    const satelliteSet = new Set();
    for (const pair of pairs) {
      const aIn = primarySet.has(pair.card1);
      const bIn = primarySet.has(pair.card2);
      if (aIn && !bIn) satelliteSet.add(pair.card2);
      else if (bIn && !aIn) satelliteSet.add(pair.card1);
    }

    const nodeDefs = [
      ...topCards.map(s => ({ name: s.card_name, focal: s.focal_score, primary: true })),
      ...[...satelliteSet].map(name => ({ name, focal: focalByName[name] || 0, primary: false })),
    ];
    const cardSet = new Set(nodeDefs.map(d => d.name));

    const nodes = nodeDefs.map((def, i) => {
      const angle = (2 * Math.PI * i) / nodeDefs.length;
      const radius = Math.min(width, height) * 0.35;
      return {
        id: def.name,
        x: width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        // Satellites get a small fixed dot; primaries scale with focal score.
        radius: def.primary ? Math.max(4, Math.min(14, 3 + def.focal * 0.5)) : 3.5,
        color: def.primary ? getNodeColor(colorMap[def.name]) : "#666",
        primary: def.primary,
        focalScore: def.focal,
      };
    });

    // Build edges from pairs where both cards are in our node set. The endpoint
    // returns only above-chance pairs (lift > 1), so every edge is a synergy; we
    // normalize lift against the strongest edge so color/thickness scale to the
    // range on screen rather than to absolute scores.
    const edges = [];
    let maxDev = 0;
    for (const pair of pairs) {
      if (cardSet.has(pair.card1) && cardSet.has(pair.card2)) {
        const dev = pair.synergy_score - 1;
        if (dev > maxDev) maxDev = dev;
        edges.push({
          source: pair.card1,
          target: pair.card2,
          weight: pair.synergy_score,
          dev: dev,
        });
      }
    }
    // Normalized 0..1 strength per edge for rendering.
    for (const edge of edges) {
      edge.strength = maxDev > 0 ? Math.max(0, edge.dev) / maxDev : 0;
    }

    // Create node index for fast lookup.
    const nodeIndex = {};
    for (let i = 0; i < nodes.length; i++) {
      nodeIndex[nodes[i].id] = i;
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    nodeIndexRef.current = nodeIndex;

    let frame = 0;
    const maxFrames = 250;
    const damping = 0.92;

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const hovered = hoveredRef.current;

      // Draw edges. Stronger synergies are brighter and thicker, scaled
      // relative to the other edges on screen.
      for (const edge of edges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const s = nodes[si];
        const t = nodes[ti];
        const connected = hovered && (edge.source === hovered || edge.target === hovered);
        // Dim everything when hovering except edges touching the hovered node.
        const baseAlpha = 0.25 + 0.55 * edge.strength;
        const alpha = hovered ? (connected ? Math.min(1, baseAlpha + 0.3) : baseAlpha * 0.25) : baseAlpha;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = `rgba(90, 200, 120, ${alpha})`;
        ctx.lineWidth = (connected ? 1.5 : 1) * (1 + 4 * edge.strength);
        ctx.stroke();
      }

      // Draw nodes.
      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();
        ctx.strokeStyle = hovered === node.id ? "#fff" : "rgba(0,0,0,0.5)";
        ctx.lineWidth = hovered === node.id ? 2 : 1;
        ctx.stroke();
      }

      // Draw hovered node label.
      if (hovered) {
        const node = nodes.find(n => n.id === hovered);
        if (node) {
          ctx.font = "13px monospace";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(node.id, node.x, node.y - node.radius - 6);
        }
      }
    }

    // Store draw function in ref so mouse handlers can trigger redraws.
    drawRef.current = draw;

    function simulate() {
      if (frame > maxFrames) {
        draw();
        return;
      }
      frame++;

      const alpha = 1 - frame / maxFrames;

      // Repulsion (Coulomb) between all node pairs.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[j].x - nodes[i].x;
          let dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Cap minimum distance so overlapping nodes don't explode.
          if (dist < 20) dist = 20;
          let force = (2000 * alpha) / (dist * dist);
          let fx = (dx / dist) * force;
          let fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction (Hooke) along edges.
      for (const edge of edges) {
        const si = nodeIndex[edge.source];
        const ti = nodeIndex[edge.target];
        if (si === undefined || ti === undefined) continue;
        const s = nodes[si];
        const t = nodes[ti];
        let dx = t.x - s.x;
        let dy = t.y - s.y;
        let strength = 0.015 * Math.min(edge.weight, 5) * alpha;
        let fx = dx * strength;
        let fy = dy * strength;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center gravity — decays with alpha so it stays balanced with repulsion.
      for (const node of nodes) {
        node.vx += (width / 2 - node.x) * 0.008 * alpha;
        node.vy += (height / 2 - node.y) * 0.008 * alpha;
      }

      // Apply velocities.
      const pad = 30;
      for (const node of nodes) {
        if (dragRef.current && dragRef.current.id === node.id) continue;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(node.radius + pad, Math.min(width - node.radius - pad, node.x));
        node.y = Math.max(node.radius + pad, Math.min(height - node.radius - pad, node.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    }

    animRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      drawRef.current = null;
    };
  }, [synergyData, cube, cardColorMap]);

  // Mouse interaction handlers.
  function getNodeAt(x, y) {
    for (const node of nodesRef.current) {
      const dx = node.x - x;
      const dy = node.y - y;
      if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
        return node;
      }
    }
    return null;
  }

  function handleMouseMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragRef.current) {
      dragRef.current.x = x;
      dragRef.current.y = y;
      dragRef.current.vx = 0;
      dragRef.current.vy = 0;
      if (drawRef.current) drawRef.current();
      return;
    }

    const node = getNodeAt(x, y);
    const newHovered = node ? node.id : null;
    if (newHovered !== hoveredRef.current) {
      hoveredRef.current = newHovered;
      if (drawRef.current) drawRef.current();
    }
    canvas.style.cursor = node ? "pointer" : "default";
  }

  function handleMouseDown(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const node = getNodeAt(x, y);
    if (node) {
      dragRef.current = node;
    }
  }

  function handleMouseUp(e) {
    if (dragRef.current) {
      const canvas = canvasRef.current;
      if (canvas && onCardSelected) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const node = getNodeAt(x, y);
        if (node && node.id === dragRef.current.id) {
          onCardSelected({ currentTarget: { id: node.id } });
        }
      }
      dragRef.current = null;
      if (drawRef.current) drawRef.current();
    }
  }

  function handleMouseLeave() {
    dragRef.current = null;
    if (hoveredRef.current) {
      hoveredRef.current = null;
      if (drawRef.current) drawRef.current();
    }
  }

  const pairs = synergyData?.pairs || [];
  const focalStats = synergyData?.focal_stats || [];
  if (pairs.length === 0 || focalStats.length === 0) {
    return null;
  }

  return (
    <div style={{textAlign: "center"}}>
      <h4 style={{color: "var(--primary)", marginBottom: "0.5rem"}}>Synergy Network Graph</h4>
      <p style={{color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "0.5rem"}}>
        Node size shows focal score, node color shows color identity. <span style={{color: "#888"}}>Gray nodes</span> are partner cards that ranked below the focal cut, pulled in so their hubs aren't left floating. Links are brighter and thicker the stronger the synergy. Hover to name, click to select, drag to move.
      </p>
      <canvas
        ref={canvasRef}
        width={900}
        height={600}
        style={{
          border: "1px solid var(--card-background)",
          borderRadius: "8px",
          background: "var(--page-background)",
          maxWidth: "100%",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
