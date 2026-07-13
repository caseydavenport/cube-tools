import React, { useState, useEffect } from 'react'
import { useCube } from "../contexts/CubeContext.js"
import { DropdownHeader } from "../components/Dropdown.js"

// The Removal page scores each piece of spot removal by how much of the cube's
// creature base it can kill (given its restrictions) and how mana-efficient it is
// versus the threats it answers. Compute is server-side (/stats/removal); this
// page fetches and renders a sortable table with a raw / play-weighted toggle.
//
// Two efficiency lenses: Reach (priciest threat it can answer, minus cost) and
// Avg (typical threat it kills, minus cost). Scalable removal (variable X, fights)
// has no comparable number and is grouped at the bottom.

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

const fmtDelta = v => v >= 0 ? `+${v}` : `${v}`

export function RemovalPage() {
  const cubeID = useCube()
  const [data, setData] = useState(null)
  const [mode, setMode] = useState("raw")
  const [colorFilter, setColorFilter] = useState("")
  const [sort, setSort] = useState({ key: "reach", dir: "desc" })

  useEffect(() => {
    fetch(`/api/${cubeID}/stats/removal`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [cubeID])

  if (!data) return <div className="analyze-page"><div className="browse-empty">Loading removal…</div></div>

  const coverage = c => mode === "raw" ? c.pct_cube : c.pct_played
  const avgEff = c => mode === "raw" ? c.efficiency : c.played_efficiency

  const sortVal = {
    name: c => c.name.toLowerCase(),
    cost: c => c.eff_cost,
    coverage: c => coverage(c),
    reach: c => c.reach_eff,
    avg: c => avgEff(c),
  }

  let rows = (data.cards || []).filter(c => !colorFilter || (c.colors || []).includes(colorFilter))
  const val = sortVal[sort.key]
  rows = [...rows].sort((a, b) => {
    // Scalable removal always sinks to the bottom - it has no comparable metric.
    if (!!a.scalable !== !!b.scalable) return a.scalable ? 1 : -1
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
            {rows.length} spot-removal rows · {data.creature_count} creatures · {data.excluded} non-spot excluded
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="widget-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              {header("name", "Card", false)}
              {header("cost", "Cost")}
              <td className="header-cell">Kind</td>
              <td className="header-cell">Restriction</td>
              {header("coverage", mode === "raw" ? "Targets (% cube)" : "% of played")}
              <td className="header-cell" style={{ textAlign: "right" }}>Max MV</td>
              {header("reach", "Reach Δ")}
              {header("avg", "Avg Δ")}
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.name} className="widget-table-row">
                <td className="header-cell" style={{ fontWeight: "bold" }}>{c.name}</td>
                <td style={{ textAlign: "right" }} title={c.mana_cost && c.eff_cost !== c.mv ? `printed ${c.mana_cost} (MV ${c.mv})` : c.mana_cost}>
                  {c.eff_cost}{c.eff_cost !== c.mv ? "*" : ""}
                </td>
                <td>{c.kind}</td>
                <td style={{ color: "var(--text-muted)" }}>{c.restriction}</td>
                {c.scalable ? (
                  <td style={{ textAlign: "center", color: "var(--text-muted)" }} colSpan={4}>scalable — depends on mana invested</td>
                ) : (
                  <>
                    <td style={{ textAlign: "right" }}>
                      {mode === "raw" ? `${c.targets} (${c.pct_cube}%)` : `${c.pct_played}%`}
                    </td>
                    <td style={{ textAlign: "right" }}>{c.max_mv_killed}</td>
                    <td style={{ textAlign: "right", background: effColor(c.reach_eff) }}>{fmtDelta(c.reach_eff)}</td>
                    <td style={{ textAlign: "right", background: effColor(avgEff(c)) }}>{fmtDelta(avgEff(c))}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="player-filter-hint" style={{ marginTop: "1rem" }}>
        Cost is the effective mana to fire the removal (delve, X≈3, reduced/activated costs); * marks an
        adjusted cost (hover for printed). <b>Reach Δ</b> = priciest threat it can answer minus cost;
        <b> Avg Δ</b> = typical threat it kills minus cost. Multi-mode cards (kicker/revolt) show one row
        per mode. Classification is heuristic; sweepers, edicts, and bounce/tap are excluded.
      </p>
    </div>
  )
}
