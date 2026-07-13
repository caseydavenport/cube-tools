import React, { useState, useEffect, useMemo } from 'react'
import { useCube } from "../contexts/CubeContext.js"
import { DropdownHeader, DateSelector, NumericInput, Button } from "../components/Dropdown.js"
import { PredicateBuilder } from "../components/PredicateBuilder.js"
import { bucketXScale } from "../utils/Buckets.js"
import { Colors as COLOR_HEXES } from "../utils/Colors.js"

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

// The Explore view is a general deck-slicing pivot: group decks/games by a
// dimension, optionally split by a second, over a filtered subpopulation, and
// read a win-rate metric. Compute is server-side (POST /stats/pivot); this page
// only builds the request and renders the response.

// Dimensions usable for group-by. Color dims also expose granularity + mode.
const GROUP_DIMS = [
  { value: "color", label: "Color", color: true },
  { value: "archetype", label: "Archetype" },
  { value: "label", label: "Label" },
  { value: "player", label: "Player" },
  { value: "time", label: "Time" },
  { value: "removal", label: "Removal count" },
  { value: "interaction", label: "Interaction count" },
  { value: "counterspell", label: "Counterspell count" },
  { value: "creatures", label: "Creature count" },
  { value: "lands", label: "Land count" },
  { value: "avg_cmc", label: "Avg mana value" },
  { value: "dna", label: "DNA count" },
]

const SPLIT_DIMS = [
  { value: "", label: "(none)" },
  { value: "opponent_color", label: "Opponent color", color: true },
  ...GROUP_DIMS,
]

const GRANULARITY_OPTS = [
  { value: 1, label: "Mono" },
  { value: 2, label: "Dual" },
  { value: 3, label: "Trio" },
]

const COLOR_MODE_OPTS = [
  { value: "inclusive", label: "Inclusive" },
  { value: "exact", label: "Exact" },
  { value: "primary", label: "Primary" },
]

const METRIC_OPTS = [
  { value: "win_pct", label: "Win %" },
  { value: "record", label: "Record" },
  { value: "games", label: "Games" },
]

const COLOR_NAMES = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
  WU: "Azorius", WB: "Orzhov", WR: "Boros", WG: "Selesnya",
  UB: "Dimir", UR: "Izzet", UG: "Simic", BR: "Rakdos", BG: "Golgari", RG: "Gruul",
  WUB: "Esper", WUR: "Jeskai", WUG: "Bant", WBR: "Mardu", WBG: "Abzan",
  WRG: "Naya", UBR: "Grixis", UBG: "Sultai", URG: "Temur", BRG: "Jund",
}

function isColorDim(dim) {
  return dim === "color" || dim === "opponent_color"
}

function keyLabel(dim, key) {
  if (key === "") return "Overall"
  if (isColorDim(dim)) return COLOR_NAMES[key] || key
  return key
}

function cellGames(c) {
  return (c.wins || 0) + (c.losses || 0) + (c.draws || 0)
}

// absColor scales a win% from red (0) through neutral (50) to green (100),
// graying out low-sample cells. Used where the reference point is the 50%
// break-even line (the group table, and a heatmap's Overall column).
function absColor(winPct, games) {
  if (games < 10) return "var(--card-background)"
  const t = Math.max(0, Math.min(1, winPct / 100))
  if (t >= 0.5) return `rgba(40, 167, 69, ${0.15 + (t - 0.5) * 2 * 0.55})`
  return `rgba(220, 53, 69, ${0.15 + (0.5 - t) * 2 * 0.55})`
}

// relColor scales a cell relative to its row's own overall win rate, so a
// heatmap reads as "better or worse than usual for this group" rather than
// against 50%. This is what surfaces confounders: White overall sits near 50%,
// but its vs-Black cell is far below White's own baseline. A ±15pp swing
// saturates.
function relColor(winPct, baseline, games) {
  if (games < 10) return "var(--card-background)"
  const d = winPct - baseline
  const mag = Math.min(1, Math.abs(d) / 15)
  if (d >= 0) return `rgba(40, 167, 69, ${0.1 + mag * 0.6})`
  return `rgba(220, 53, 69, ${0.1 + mag * 0.6})`
}

// barColor tints a group's bar by its color identity (mono uses the color, a
// guild pair blends its two). Non-color dimensions fall back to green.
function barColor(dim, key) {
  if (isColorDim(dim) && key) {
    if (key.length === 1) return COLOR_HEXES.get(key) || "rgba(40, 167, 69, 0.7)"
    const parts = [...key].map(c => COLOR_HEXES.get(c)).filter(Boolean)
    if (parts.length) return blendHex(parts)
  }
  return "rgba(40, 167, 69, 0.7)"
}

function blendHex(hexes) {
  let r = 0, g = 0, b = 0
  for (const h of hexes) {
    r += parseInt(h.slice(1, 3), 16)
    g += parseInt(h.slice(3, 5), 16)
    b += parseInt(h.slice(5, 7), 16)
  }
  const n = hexes.length
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
}

function metricText(metric, c) {
  if (!c) return ""
  if (metric === "record") return `${c.wins}-${c.losses}${c.draws ? "-" + c.draws : ""}`
  if (metric === "games") return `${cellGames(c)}`
  return cellGames(c) > 0 ? `${Math.round(c.win_pct)}%` : ""
}

export function ExplorePage(props) {
  const cubeID = useCube()
  const [refresh, setRefresh] = useState(1)

  const [groupBy, setGroupBy] = useState({ dim: "color", granularity: 1, color_mode: "inclusive" })
  const [splitBy, setSplitBy] = useState({ dim: "", granularity: 1, color_mode: "inclusive" })
  const [metric, setMetric] = useState("win_pct")
  const [bucketSize, setBucketSize] = useState(3)
  const [predicates, setPredicates] = useState([])

  const [result, setResult] = useState(null)
  const [meta, setMeta] = useState({ archetypes: [], players: [], labels: [] })

  const start = props.startDate || ""
  const end = props.endDate || ""
  const usesTime = groupBy.dim === "time" || splitBy.dim === "time"

  // Pull the known archetypes / players / labels for the filter dropdowns.
  useEffect(() => {
    const p = new URLSearchParams()
    if (start) p.set("start", start)
    if (end) p.set("end", end)
    fetch(`/api/${cubeID}/decks?${p}`)
      .then(r => r.json())
      .then(d => {
        const arch = new Set(), players = new Set(), labels = new Set()
        for (const deck of d.decks || []) {
          if (deck.macro_archetype) arch.add(deck.macro_archetype)
          if (deck.player) players.add(deck.player)
          for (const l of deck.labels || []) labels.add(l)
        }
        setMeta({
          archetypes: [...arch].sort(),
          players: [...players].sort(),
          labels: [...labels].sort(),
        })
      })
      .catch(() => {})
  }, [cubeID, start, end])

  // Run the pivot whenever the query changes.
  useEffect(() => {
    const body = {
      start, end,
      group_by: groupBy,
      split_by: splitBy,
      bucket_size: usesTime ? Number(bucketSize) : 0,
      predicates: predicates.filter(p => p.dim === "card_query" ? p.value !== "" : p.value !== ""),
    }
    fetch(`/api/${cubeID}/stats/pivot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(setResult)
      .catch(() => setResult(null))
  }, [cubeID, start, end, groupBy, splitBy, bucketSize, predicates, refresh, usesTime])

  const controls = (
    <div className="explore-controls">
      <div className="selector-group">
        <Button text="Refresh" onClick={() => setRefresh(r => r + 1)} />
        <DateSelector label="From" id="explore-from" value={start} onChange={props.onStartSelected} />
        <DateSelector label="To" id="explore-to" value={end} onChange={props.onEndSelected} />
      </div>

      <div className="selector-group">
        <DropdownHeader label="Group by" value={groupBy.dim} options={GROUP_DIMS}
          onChange={(e) => setGroupBy({ ...groupBy, dim: e.target.value })} />
        {isColorDim(groupBy.dim) && (
          <>
            <DropdownHeader label="" value={groupBy.granularity} options={GRANULARITY_OPTS}
              onChange={(e) => setGroupBy({ ...groupBy, granularity: Number(e.target.value) })} />
            <DropdownHeader label="" value={groupBy.color_mode} options={COLOR_MODE_OPTS}
              onChange={(e) => setGroupBy({ ...groupBy, color_mode: e.target.value })} />
          </>
        )}

        <DropdownHeader label="Split by" value={splitBy.dim} options={SPLIT_DIMS}
          onChange={(e) => setSplitBy({ ...splitBy, dim: e.target.value })} />
        {isColorDim(splitBy.dim) && (
          <>
            <DropdownHeader label="" value={splitBy.granularity} options={GRANULARITY_OPTS}
              onChange={(e) => setSplitBy({ ...splitBy, granularity: Number(e.target.value) })} />
            <DropdownHeader label="" value={splitBy.color_mode} options={COLOR_MODE_OPTS}
              onChange={(e) => setSplitBy({ ...splitBy, color_mode: e.target.value })} />
          </>
        )}

        <DropdownHeader label="Metric" value={metric} options={METRIC_OPTS}
          onChange={(e) => setMetric(e.target.value)} />
        {usesTime && (
          <NumericInput label="Bucket" value={bucketSize}
            onChange={(e) => setBucketSize(Math.max(1, Number(e.target.value)))} />
        )}
      </div>

      <PredicateBuilder predicates={predicates} onChange={setPredicates} meta={meta} />
    </div>
  )

  return (
    <div className="analyze-page explore-page">
      {controls}
      <ExploreResult result={result} groupBy={groupBy} splitBy={splitBy} metric={metric} usesTime={usesTime} />
    </div>
  )
}

function ExploreResult({ result, groupBy, splitBy, metric, usesTime }) {
  if (!result || !result.rows || result.rows.length === 0) {
    return <div className="browse-empty">No decks match this slice.</div>
  }
  if (usesTime) {
    return <PivotLineChart result={result} groupBy={groupBy} splitBy={splitBy} metric={metric} />
  }
  if (splitBy.dim) {
    return <PivotHeatmap result={result} groupBy={groupBy} splitBy={splitBy} metric={metric} />
  }
  return <PivotTable result={result} groupBy={groupBy} metric={metric} />
}

// PivotTable: one row per group, plus a win% bar chart.
function PivotTable({ result, groupBy, metric }) {
  const rows = result.rows
  const labels = rows.map(r => keyLabel(groupBy.dim, r.key))
  const data = rows.map(r => r.cells[""]?.win_pct || 0)

  const barColors = rows.map(r => barColor(groupBy.dim, r.key))
  const chartData = {
    labels,
    datasets: [{
      label: "Win %",
      data,
      backgroundColor: barColors,
      borderColor: barColors,
      borderWidth: 1,
    }],
  }
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { min: 0, max: 100, ticks: { color: "white" } }, x: { ticks: { color: "white" } } },
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="widget-table" style={{ margin: "0 auto" }}>
          <thead>
            <tr>
              <td className="header-cell">{groupLabel(groupBy.dim)}</td>
              <td className="header-cell">Win %</td>
              <td className="header-cell">Record</td>
              <td className="header-cell">Decks</td>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const c = r.cells[""]
              return (
                <tr key={r.key} className="widget-table-row">
                  <td className="header-cell" style={{ fontWeight: "bold" }}>{keyLabel(groupBy.dim, r.key)}</td>
                  <td style={{ textAlign: "center", background: absColor(c.win_pct, cellGames(c)) }}>
                    {cellGames(c) > 0 ? `${c.win_pct}%` : "-"}
                  </td>
                  <td style={{ textAlign: "center" }}>{c.wins}-{c.losses}{c.draws ? `-${c.draws}` : ""}</td>
                  <td style={{ textAlign: "center" }}>{c.decks}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ height: "320px", marginTop: "2rem" }}>
        <Bar options={options} data={chartData} />
      </div>
    </div>
  )
}

// PivotHeatmap: group rows × split columns, colored by win%.
function PivotHeatmap({ result, groupBy, splitBy, metric }) {
  const [sortColumn, setSortColumn] = React.useState(null)
  const cols = result.columns || [""]

  let rows = result.rows
  if (sortColumn !== null) {
    rows = [...rows].sort((a, b) => (b.cells[sortColumn]?.win_pct ?? -1) - (a.cells[sortColumn]?.win_pct ?? -1))
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="widget-table" style={{ margin: "0 auto", fontSize: "0.85em" }}>
        <thead>
          <tr>
            <td className="header-cell" style={{ minWidth: "80px" }}>{groupLabel(groupBy.dim)}</td>
            {cols.map(col => (
              <td key={col} className="header-cell"
                style={{
                  textAlign: "center", minWidth: "60px", cursor: "pointer",
                  background: sortColumn === col ? "var(--primary)" : undefined,
                  color: sortColumn === col ? "var(--page-background)" : undefined,
                }}
                onClick={() => setSortColumn(sortColumn === col ? null : col)}>
                {keyLabel(splitBy.dim, col)}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            // The row's overall win rate is the baseline the split cells are
            // shaded against, so each cell reads as better/worse than usual for
            // this group. The Overall column keeps the absolute 50% reference.
            const baseline = r.cells[""]?.win_pct ?? 50
            return (
              <tr key={r.key} className="widget-table-row">
                <td className="header-cell" style={{ fontWeight: "bold" }}>{keyLabel(groupBy.dim, r.key)}</td>
                {cols.map(col => {
                  const c = r.cells[col]
                  const games = c ? cellGames(c) : 0
                  let bg
                  if (metric === "win_pct" && c) {
                    bg = col === "" ? absColor(c.win_pct, games) : relColor(c.win_pct, baseline, games)
                  }
                  return (
                    <td key={col} title={c ? `${c.wins}W-${c.losses}L${c.draws ? "-" + c.draws + "D" : ""} (${games} games)${col !== "" ? `, ${(c.win_pct - baseline >= 0 ? "+" : "")}${(c.win_pct - baseline).toFixed(1)} vs row avg` : ""}` : ""}
                      style={{
                        textAlign: "center",
                        background: bg,
                        opacity: games > 0 && games < 10 ? 0.45 : 1,
                      }}>
                      {metricText(metric, c)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// PivotLineChart: whichever dimension is time becomes the x-axis; the other
// dimension becomes one line per key.
function PivotLineChart({ result, groupBy, splitBy, metric }) {
  const groupIsTime = groupBy.dim === "time"
  const timeDim = groupIsTime ? groupBy.dim : splitBy.dim
  const seriesDim = groupIsTime ? splitBy.dim : groupBy.dim

  let xLabels, series
  if (groupIsTime) {
    // Rows are time buckets; columns are series.
    xLabels = result.rows.map(r => r.key)
    const cols = result.columns || [""]
    series = cols.map(col => ({
      key: col,
      points: result.rows.map(r => metricValue(metric, r.cells[col])),
    }))
  } else {
    // Columns are time buckets; rows are series.
    xLabels = (result.columns || [""]).filter(c => c !== "")
    if (xLabels.length === 0) xLabels = result.columns || [""]
    series = result.rows.map(r => ({
      key: r.key,
      points: xLabels.map(col => metricValue(metric, r.cells[col])),
    }))
  }

  const palette = ["#28a745", "#007bff", "#6f42c1", "#fd7e14", "#e83e8c", "#20c997", "#dc3545", "#ffc107"]
  const datasets = series.map((s, i) => ({
    label: keyLabel(seriesDim, s.key),
    data: s.points,
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length],
    spanGaps: true,
  }))

  const yMax = metric === "win_pct" ? 100 : undefined
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "white" } } },
    scales: {
      x: bucketXScale,
      y: { min: 0, max: yMax, ticks: { color: "white" } },
    },
  }

  return (
    <div style={{ height: "420px" }}>
      <Line options={options} data={{ labels: xLabels, datasets }} />
    </div>
  )
}

function metricValue(metric, c) {
  if (!c) return null
  if (metric === "games") return cellGames(c)
  return c.win_pct // record falls back to win% for a numeric line
}

function groupLabel(dim) {
  const d = GROUP_DIMS.find(x => x.value === dim) || SPLIT_DIMS.find(x => x.value === dim)
  return d ? d.label : dim
}
