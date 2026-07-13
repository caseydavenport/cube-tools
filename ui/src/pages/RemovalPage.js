import React, { useState, useEffect } from 'react'
import { useCube } from "../contexts/CubeContext.js"
import { DropdownHeader } from "../components/Dropdown.js"

// The Removal page scores each piece of spot removal by how much of the cube's
// creature base it can kill (given its restrictions) and how mana-efficient it is
// versus the threats it answers. Compute is server-side (/stats/removal); this
// page fetches and renders a sortable table with a raw / play-weighted toggle.

const COVERAGE_OPTS = [
  { value: "raw", label: "Raw (cube)" },
  { value: "played", label: "Play-weighted" },
]

const COLOR_OPTS = [
  { value: "", label: "All colors" },
  { value: "W", label: "White" }, { value: "U", label: "Blue" }, { value: "B", label: "Black" },
  { value: "R", label: "Red" }, { value: "G", label: "Green" },
]

// effColor tints an efficiency delta: green when the spell answers threats pricier
// than itself, red when it costs more than what it kills. ±3 MV saturates.
function effColor(v) {
  const m = Math.min(1, Math.abs(v) / 3)
  if (v >= 0) return `rgba(40, 167, 69, ${0.12 + m * 0.6})`
  return `rgba(220, 53, 69, ${0.12 + m * 0.6})`
}

export function RemovalPage() {
  const cubeID = useCube()
  const [data, setData] = useState(null)
  const [mode, setMode] = useState("raw")
  const [colorFilter, setColorFilter] = useState("")
  const [sort, setSort] = useState({ key: "eff", dir: "desc" })

  useEffect(() => {
    fetch(`/api/${cubeID}/stats/removal`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [cubeID])

  if (!data) return <div className="analyze-page"><div className="browse-empty">Loading removal…</div></div>

  const coverage = c => mode === "raw" ? c.pct_cube : c.pct_played
  const avgMV = c => mode === "raw" ? c.avg_mv_killed : c.played_avg_mv_killed
  const eff = c => mode === "raw" ? c.efficiency : c.played_efficiency

  const sortVal = {
    name: c => c.name.toLowerCase(),
    mv: c => c.mv,
    coverage: c => coverage(c),
    avgmv: c => avgMV(c),
    eff: c => eff(c),
  }

  let rows = (data.cards || []).filter(c => !colorFilter || (c.colors || []).includes(colorFilter))
  const val = sortVal[sort.key]
  rows = [...rows].sort((a, b) => {
    const av = val(a), bv = val(b)
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sort.dir === "asc" ? cmp : -cmp
  })

  function header(key, label, numeric = true) {
    const active = sort.key === key
    return (
      <td className="header-cell" style={{ cursor: "pointer", textAlign: numeric ? "right" : "left", background: active ? "var(--primary)" : undefined, color: active ? "var(--page-background)" : undefined }}
        onClick={() => setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: numeric ? "desc" : "asc" })}>
        {label}{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
      </td>
    )
  }

  return (
    <div className="analyze-page">
      <div className="explore-controls">
        <div className="selector-group">
          <DropdownHeader label="Coverage" value={mode} options={COVERAGE_OPTS} onChange={e => setMode(e.target.value)} />
          <DropdownHeader label="Color" value={colorFilter} options={COLOR_OPTS} onChange={e => setColorFilter(e.target.value)} />
          <span className="player-filter-hint">
            {rows.length} spot-removal cards · {data.creature_count} creatures · {data.excluded} non-spot excluded
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="widget-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              {header("name", "Card", false)}
              {header("mv", "Cost")}
              <td className="header-cell">Kind</td>
              <td className="header-cell">Restriction</td>
              {header("coverage", mode === "raw" ? "Targets (% cube)" : "% of played")}
              {header("avgmv", "Avg MV killed")}
              {header("eff", "Efficiency Δ")}
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.name} className="widget-table-row">
                <td className="header-cell" style={{ fontWeight: "bold" }}>{c.name}</td>
                <td style={{ textAlign: "right" }}>{c.mana_cost || c.mv}</td>
                <td>{c.kind}</td>
                <td style={{ color: "var(--text-muted)" }}>{c.restriction}</td>
                <td style={{ textAlign: "right" }}>
                  {mode === "raw" ? `${c.targets} (${c.pct_cube}%)` : `${c.pct_played}%`}
                </td>
                <td style={{ textAlign: "right" }}>{c.scalable ? "—" : avgMV(c)}</td>
                <td title={c.scalable ? "scalable (X): cost is variable" : ""}
                  style={{ textAlign: "right", background: c.scalable ? undefined : effColor(eff(c)) }}>
                  {c.scalable ? "scalable" : (eff(c) >= 0 ? `+${eff(c)}` : eff(c))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="player-filter-hint" style={{ marginTop: "1rem" }}>
        Coverage counts cube creatures a spell can legally kill. Efficiency Δ = avg mana value of
        killable threats minus the spell's own cost (positive = answers pricier threats). Classification
        is heuristic; sweepers, edicts, and bounce/tap are excluded.
      </p>
    </div>
  )
}
