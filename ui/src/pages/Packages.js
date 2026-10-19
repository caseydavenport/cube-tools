import React, { useState, useEffect } from 'react'
import { Select } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { SortHeader } from "../stats/sortHeader.js"
import { compareBy } from "../stats/sortOrder.js"
import { goodBadTint } from "../stats/tints.js"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"
import "../stats/stats.css"

// COPY holds the text this page adds around its table. Placeholders for Casey
// to replace.
const COPY = {
  title: "Packages",
  tableTitle: "Rule labels",
  settings: "Settings",
  confidence: "Build-rate confidence",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",
}

// The Packages page shows how often each rule label coheres into a package across
// the corpus. Build rate is package/populated decks; commitment ratio is
// package/has3, a strategy-vs-glue score. Compute lives in /stats/packages; this
// page just fetches and renders a sortable table.

// rateColor tints a 0-1 rate in the good color, stronger toward 1. Build rate
// and commitment ratio both read "more is a stronger signal", so both use it.
function rateColor(t) {
  return goodBadTint(Math.max(0, t))
}

const pct = v => `${Math.round(v * 100)}%`

// ciTooltip spells out the build-rate interval behind a cell, so the table stays
// clean but the sample and bounds are one hover away.
function ciTooltip(s, populated, confidence) {
  const level = Math.round(parseFloat(confidence || "0.8") * 100)
  return `${s.package} of ${populated} populated decks built this package\n` +
    `${level}% CI: ${pct(s.buildRate)} (${pct(s.buildRateLow)}–${pct(s.buildRateHigh)})`
}

// Packages is the Packages page: the toolbar with its date range and
// confidence setting, then the table of rule labels.
export function Packages(props) {
  const cubeID = useCube()
  const start = props.startDate || ""
  const end = props.endDate || ""
  const [data, setData] = useState(null)
  const [confidence, setConfidence] = useState("0.8")
  const [sort, setSort] = useState({ key: "buildRate", dir: "desc" })

  useEffect(() => {
    const p = new URLSearchParams({ confidence })
    if (start) p.set("start", start)
    if (end) p.set("end", end)
    fetch(`/api/${cubeID}/stats/packages?${p}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [cubeID, confidence, start, end])

  const settings = (
    <SettingsPopover label={COPY.settings}>
      <Select
        size="xs"
        label={COPY.confidence}
        data={WIN_CONFIDENCE_OPTS}
        value={confidence}
        onChange={setConfidence}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
      />
    </SettingsPopover>
  )

  const toolbar = (
    <PageToolbar title={COPY.title} actions={settings}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={COPY} />
    </PageToolbar>
  )

  if (!data) {
    return (
      <>
        {toolbar}
        <div className="analyze-page"><div className="browse-empty">Loading packages…</div></div>
      </>
    )
  }

  const sortVal = {
    label: s => s.label.toLowerCase(),
    package: s => s.package,
    buildRate: s => s.buildRate,
    has3: s => s.has3,
    commitmentRatio: s => s.commitmentRatio,
  }

  const rows = [...(data.packages || [])].sort(compareBy(sortVal[sort.key], sort.dir))

  // header is one column's sortable header cell.
  function header(key, label, numeric = true) {
    return <SortHeader sortKey={key} label={label} sort={sort} setSort={setSort} numeric={numeric} />
  }

  const summary = (
    <span className="player-filter-hint">
      {rows.length} labels · {data.populatedDecks} populated decks
    </span>
  )

  return (
    <>
      {toolbar}
      <div className="analyze-page">
        <SectionCard title={COPY.tableTitle} action={summary}>
          <div className="stats-table-wrap">
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
        </SectionCard>
        <p className="player-filter-hint" style={{ marginTop: "1rem" }}>
          A deck is <b>populated</b> if it has any non-basic mainboard card. <b>Has 3+</b> counts decks
          carrying at least three cards that touch a label; a <b>package</b> is when those cards cluster
          into a cohesive community (size 3+) whose dominant label is this one. <b>Build rate</b> is
          packages over populated decks (with a Wilson interval at the chosen confidence);
          <b> commitment</b> is packages over has-3 decks - low means the cards show up but rarely cohere.
        </p>
      </div>
    </>
  )
}
