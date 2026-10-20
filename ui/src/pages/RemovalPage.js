import React, { useState, useEffect } from 'react'
import { SegmentedControl } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { DropdownHeader } from "../components/Dropdown.js"
import { RichText } from "../components/kit/RichText.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { SortHeader } from "../stats/sortHeader.js"
import { compareBy } from "../stats/sortOrder.js"
import { goodBadTint } from "../stats/tints.js"
import { availableValue, visibleItems } from "../utils/dataKinds.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import "../stats/stats.css"

// COPY holds the text this page adds around its table. Placeholders for Casey
// to replace.
const COPY = {
  title: "Removal",
  tableTitle: "Spot removal",
  coverage: "Coverage",
  loading: "Loading removal…",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",

  coverageOpts: { raw: "Raw (cube)", played: "Play-weighted" },
  colors: { all: "All colors", W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" },
  colorLabel: "Color",
  summary: ({ rows, creatures, excluded }) =>
    `${rows} spot-removal rows · ${creatures} creatures · ${excluded} non-spot excluded`,

  columns: {
    card: "Card",
    cost: "Cost",
    kind: "Kind",
    restriction: "Restriction",
    targets: "Targets (% cube)",
    percentPlayed: "% of played",
    maxMv: "Max MV",
    reach: "Reach Δ",
    avg: "Avg Δ",
  },

  costTitle: ({ manaCost, mv }) => `printed ${manaCost} (MV ${mv})`,
  scalable: "scalable — depends on mana invested",

  hint: [
    "Cost is the effective mana to fire the removal (delve, X≈3, reduced/activated costs); * marks an adjusted cost (hover for printed). ",
    { bold: "Reach Δ" },
    " = priciest threat it can answer minus cost;",
    { bold: " Avg Δ" },
    " = typical threat it kills minus cost. Multi-mode cards (kicker/revolt) show one row per mode. Classification is heuristic; sweepers, edicts, and bounce/tap are excluded.",
  ],
}

// The Removal page scores each piece of spot removal by how much of the cube's
// creature base it can kill (given its restrictions) and how mana-efficient it is
// versus the threats it answers. Compute is server-side (/stats/removal); this
// page fetches and renders a sortable table with a raw / play-weighted toggle.
//
// Two efficiency lenses: Reach (priciest threat it can answer, minus cost) and
// Avg (typical threat it kills, minus cost). Scalable removal (variable X, fights)
// has no comparable number and is grouped at the bottom.

// COVERAGE_OPTS are the two ways to count what a spell can kill: against the
// cube's creatures, or weighted by how often each creature was played, which
// needs decks.
const COVERAGE_OPTS = [
  { value: "raw", label: COPY.coverageOpts.raw },
  { value: "played", label: COPY.coverageOpts.played, needs: ["decks"] },
]

const COLOR_OPTS = [
  { value: "", label: COPY.colors.all },
  { value: "W", label: COPY.colors.W }, { value: "U", label: COPY.colors.U }, { value: "B", label: COPY.colors.B },
  { value: "R", label: COPY.colors.R }, { value: "G", label: COPY.colors.G },
]

// effColor tints an efficiency delta: good when the spell answers threats
// pricier than itself, bad when it costs more than what it kills. ±3 MV
// saturates.
function effColor(v) {
  return goodBadTint(v / 3)
}

const fmtDelta = v => v >= 0 ? `+${v}` : `${v}`

// RemovalPage is the Removal page: the toolbar with its date range, then the
// table of spot removal with its coverage and color controls.
export function RemovalPage(props) {
  const cubeID = useCube()
  const info = useCubeInfo(cubeID)
  const start = props.startDate || ""
  const end = props.endDate || ""
  const [data, setData] = useState(null)
  const [mode, setMode] = useState("raw")
  const [colorFilter, setColorFilter] = useState("")
  const [sort, setSort] = useState({ key: "reach", dir: "desc" })

  useEffect(() => {
    const p = new URLSearchParams()
    if (start) p.set("start", start)
    if (end) p.set("end", end)
    fetch(`/api/${cubeID}/stats/removal?${p}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [cubeID, start, end])

  const toolbar = (
    <PageToolbar title={COPY.title}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={COPY} />
    </PageToolbar>
  )

  if (!data) {
    return (
      <>
        {toolbar}
        <div className="analyze-page"><div className="browse-empty">{COPY.loading}</div></div>
      </>
    )
  }

  // A cube without decks can only count against the raw cube.
  const shownMode = availableValue(mode, COVERAGE_OPTS, info)
  const coverage = c => shownMode === "raw" ? c.pct_cube : c.pct_played
  const avgEff = c => shownMode === "raw" ? c.efficiency : c.played_efficiency

  const sortVal = {
    name: c => c.name.toLowerCase(),
    cost: c => c.eff_cost,
    coverage: c => coverage(c),
    reach: c => c.reach_eff,
    avg: c => avgEff(c),
  }

  let rows = (data.cards || []).filter(c => !colorFilter || (c.colors || []).includes(colorFilter))
  const byValue = compareBy(sortVal[sort.key], sort.dir)
  rows = [...rows].sort((a, b) => {
    // Scalable removal always sinks to the bottom - it has no comparable metric.
    if (!!a.scalable !== !!b.scalable) return a.scalable ? 1 : -1
    return byValue(a, b)
  })

  // header is one column's sortable header cell.
  function header(key, label, numeric = true) {
    return <SortHeader sortKey={key} label={label} sort={sort} setSort={setSort} numeric={numeric} />
  }

  const controls = (
    <div className="stats-controls">
      <SegmentedControl
        size="xs"
        aria-label={COPY.coverage}
        data={visibleItems(COVERAGE_OPTS, info)}
        value={shownMode}
        onChange={setMode}
      />
      <DropdownHeader label={COPY.colorLabel} value={colorFilter} options={COLOR_OPTS} onChange={e => setColorFilter(e.target.value)} />
      <span className="player-filter-hint">
        {COPY.summary({ rows: rows.length, creatures: data.creature_count, excluded: data.excluded })}
      </span>
    </div>
  )

  return (
    <>
      {toolbar}
      <div className="analyze-page">
        <SectionCard title={COPY.tableTitle} action={controls}>
          <div className="stats-table-wrap">
            <table className="widget-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  {header("name", COPY.columns.card, false)}
                  {header("cost", COPY.columns.cost)}
                  <td className="header-cell">{COPY.columns.kind}</td>
                  <td className="header-cell">{COPY.columns.restriction}</td>
                  {header("coverage", shownMode === "raw" ? COPY.columns.targets : COPY.columns.percentPlayed)}
                  <td className="header-cell" style={{ textAlign: "right" }}>{COPY.columns.maxMv}</td>
                  {header("reach", COPY.columns.reach)}
                  {header("avg", COPY.columns.avg)}
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.name} className="widget-table-row">
                    <td className="header-cell" style={{ fontWeight: "bold" }}>{c.name}</td>
                    <td style={{ textAlign: "right" }} title={c.mana_cost && c.eff_cost !== c.mv ? COPY.costTitle({ manaCost: c.mana_cost, mv: c.mv }) : c.mana_cost}>
                      {c.eff_cost}{c.eff_cost !== c.mv ? "*" : ""}
                    </td>
                    <td>{c.kind}</td>
                    <td style={{ color: "var(--text-muted)" }}>{c.restriction}</td>
                    {c.scalable ? (
                      <td style={{ textAlign: "center", color: "var(--text-muted)" }} colSpan={4}>{COPY.scalable}</td>
                    ) : (
                      <>
                        <td style={{ textAlign: "right" }}>
                          {shownMode === "raw" ? `${c.targets} (${c.pct_cube}%)` : `${c.pct_played}%`}
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
        </SectionCard>
        <p className="player-filter-hint" style={{ marginTop: "1rem" }}>
          <RichText parts={COPY.hint} />
        </p>
      </div>
    </>
  )
}
