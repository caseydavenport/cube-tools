import React, { useState, useEffect } from 'react'
import { useCube } from "../contexts/CubeContext.js"
import { DropdownHeader } from "../components/Dropdown.js"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"

// The Packages page shows how often each rule label coheres into a package across
// the corpus. Build rate is package/populated decks; commitment ratio is
// package/has3, a strategy-vs-glue score. Compute lives in /stats/packages; this
// page just fetches and renders a sortable table.

// rateColor tints a 0-1 rate green, saturating toward 1. Build rate and commitment
// ratio both read "more is a stronger signal", so both use it.
function rateColor(t) {
  const m = Math.max(0, Math.min(1, t))
  return `rgba(40, 167, 69, ${0.1 + m * 0.6})`
}

const pct = v => `${Math.round(v * 100)}%`

// ciTooltip spells out the build-rate interval behind a cell, so the table stays
// clean but the sample and bounds are one hover away.
function ciTooltip(s, populated, confidence) {
  const level = Math.round(parseFloat(confidence || "0.8") * 100)
  return `${s.package} of ${populated} populated decks built this package\n` +
    `${level}% CI: ${pct(s.buildRate)} (${pct(s.buildRateLow)}–${pct(s.buildRateHigh)})`
}

export function Packages() {
  const cubeID = useCube()
  const [data, setData] = useState(null)
  const [confidence, setConfidence] = useState("0.8")
  const [sort, setSort] = useState({ key: "buildRate", dir: "desc" })

  useEffect(() => {
    fetch(`/api/${cubeID}/stats/packages?confidence=${confidence}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [cubeID, confidence])

  if (!data) return <div className="analyze-page"><div className="browse-empty">Loading packages…</div></div>

  const sortVal = {
    label: s => s.label.toLowerCase(),
    package: s => s.package,
    buildRate: s => s.buildRate,
    has3: s => s.has3,
    commitmentRatio: s => s.commitmentRatio,
  }

  const val = sortVal[sort.key]
  const rows = [...(data.packages || [])].sort((a, b) => {
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
          <DropdownHeader label="Build-rate confidence" value={confidence} options={WIN_CONFIDENCE_OPTS} onChange={e => setConfidence(e.target.value)} />
          <span className="player-filter-hint">
            {rows.length} labels · {data.populatedDecks} populated decks
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="widget-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              {header("label", "Label", false)}
              {header("buildRate", "Build rate")}
              {header("package", "Packages")}
              {header("has3", "Has 3+")}
              {header("commitmentRatio", "Commitment")}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.label} className="widget-table-row">
                <td className="header-cell" style={{ fontWeight: "bold" }}>{s.label}</td>
                <td style={{ textAlign: "right", background: rateColor(s.buildRate) }} title={ciTooltip(s, data.populatedDecks, confidence)}>
                  {pct(s.buildRate)}
                </td>
                <td style={{ textAlign: "right" }}>{s.package}</td>
                <td style={{ textAlign: "right" }} title={`${s.has3} decks carry 3+ of this label's cards (${pct(s.has3Rate)} of populated)`}>
                  {s.has3} <span style={{ color: "var(--text-muted)" }}>({pct(s.has3Rate)})</span>
                </td>
                <td style={{ textAlign: "right", background: rateColor(s.commitmentRatio) }} title="package decks / has-3 decks: how often the cards, once present, actually form a package">
                  {s.commitmentRatio.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="player-filter-hint" style={{ marginTop: "1rem" }}>
        A deck is <b>populated</b> if it has any non-basic mainboard card. <b>Has 3+</b> counts decks
        carrying at least three cards that touch a label; a <b>package</b> is when those cards cluster
        into a cohesive community (size 3+) whose dominant label is this one. <b>Build rate</b> is
        packages over populated decks (with a Wilson interval at the chosen confidence);
        <b> commitment</b> is packages over has-3 decks - low means the cards show up but rarely cohere.
      </p>
    </div>
  )
}
