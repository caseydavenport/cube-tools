import React, { useState, useEffect } from 'react'
import { useCube } from "../contexts/CubeContext.js"
import { ChoiceHeader } from "../components/Dropdown.js"
import { COLOR_WORDS, ManaToggles } from "../components/ManaToggles.js"
import { TabNav } from "../components/PageSections.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { SortHeader } from "../stats/sortHeader.js"
import { compareBy } from "../stats/sortOrder.js"
import { availableValue, visibleItems } from "../utils/dataKinds.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { HardToRemove } from "../removal/HardToRemove.js"
import { RemovalByColor } from "../removal/RemovalByColor.js"
import { RemovalScatter } from "../removal/RemovalScatter.js"
import "../stats/stats.css"
import "./pages.css"
import { CardLink } from "../components/CardLink.js"

// COPY holds the text this page adds around its table. Placeholders for Casey
// to replace.
const COPY = {
  title: "Removal",
  tableTitle: "Spot removal",
  scatterTitle: "Coverage against cost",
  coverage: "Coverage",
  loading: "Loading removal…",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",

  tabs: { table: "Table", scatter: "Coverage vs cost", byColor: "By color", hard: "Hard to remove" },
  coverageOpts: { raw: "Raw (cube)", played: "Play-weighted" },
  colorLabel: "Removal color",
  colorTip: color => `Only ${COLOR_WORDS[color]} and colorless removal`,
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
  },

  columnTips: {
    cost: "Effective mana to cast the removal. A * marks an adjusted cost, such as delve, X, or a reduced or activated cost.",
    kind: "The way the card removes a creature.",
    restriction: "Limits on which creatures the card can target.",
    targets: "Share of the cube's creatures this removal can answer.",
    percentPlayed: "Share of creatures played in decks that this removal can answer.",
    maxMv: "Highest mana value of a creature the card can answer.",
  },

  costTitle: ({ manaCost, mv }) => `printed ${manaCost} (MV ${mv})`,
  scalable: "scalable — depends on mana invested",

}

// The Removal page scores each piece of spot removal by how much of the cube's
// creature base it can kill (given its restrictions) against what it costs.
// Compute is server-side (/stats/removal); this page draws the table, the
// scatter, the per-color summary and the hardest creatures to answer, one tab
// at a time. Scalable removal (variable X, fights) has no comparable coverage
// and sits at the bottom.

// PAGE_TABS are the Removal page's tabs, the table first.
const PAGE_TABS = [
  { id: "table", label: COPY.tabs.table },
  { id: "scatter", label: COPY.tabs.scatter },
  { id: "bycolor", label: COPY.tabs.byColor },
  { id: "hard", label: COPY.tabs.hard },
]

// COVERAGE_OPTS are the two ways to count what a spell can kill: against the
// cube's creatures, or weighted by how often each creature was played, which
// needs decks.
const COVERAGE_OPTS = [
  { value: "raw", label: COPY.coverageOpts.raw },
  { value: "played", label: COPY.coverageOpts.played, needs: ["decks"] },
]

// matchesColorFilter keeps a removal row under the chosen color. Colorless
// removal, such as artifacts, fits any deck, so it stays under every color.
function matchesColorFilter(card, color) {
  if (!color) {
    return true
  }
  const colors = card.colors || []
  if (colors.length === 0) {
    return true
  }
  return colors.includes(color)
}

// removalCardName is the card behind a removal row. A multi-mode card's rows
// are named "Bloodchief's Thirst (kicked)", so the mode in parentheses goes.
function removalCardName(rowName) {
  return rowName.replace(/ \([^)]*\)$/, "")
}

// RemovalPage is the Removal page: the toolbar with its date range, coverage
// switch and color toggles, then one tab at a time.
export function RemovalPage(props) {
  const cubeID = useCube()
  const info = useCubeInfo(cubeID)
  const start = props.startDate || ""
  const end = props.endDate || ""
  const [data, setData] = useState(null)
  const [tab, setTab] = useState("table")
  const [mode, setMode] = useState("raw")
  const [colorFilter, setColorFilter] = useState("")
  const [sort, setSort] = useState({ key: "coverage", dir: "desc" })

  useEffect(() => {
    const p = new URLSearchParams()
    if (start) p.set("start", start)
    if (end) p.set("end", end)
    fetch(`/api/${cubeID}/stats/removal?${p}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [cubeID, start, end])

  // A cube without decks can only count against the raw cube.
  const shownMode = availableValue(mode, COVERAGE_OPTS, info)

  // toggleColor picks one color at a time; clicking the picked one clears it.
  function toggleColor(color) {
    if (color === colorFilter) {
      setColorFilter("")
    } else {
      setColorFilter(color)
    }
  }

  let selectedColors = []
  if (colorFilter) {
    selectedColors = [colorFilter]
  }

  const toolbar = (
    <PageToolbar title={COPY.title}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={COPY} />
      <ChoiceHeader
        label={COPY.coverage}
        options={visibleItems(COVERAGE_OPTS, info)}
        value={shownMode}
        onChange={e => setMode(e.target.value)}
      />
      <ManaToggles label={COPY.colorLabel} selected={selectedColors} onToggle={toggleColor} tip={COPY.colorTip} />
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

  const coverage = c => shownMode === "raw" ? c.pct_cube : c.pct_played

  const sortVal = {
    name: c => c.name.toLowerCase(),
    cost: c => c.eff_cost,
    coverage: c => coverage(c),
  }

  let rows = (data.cards || []).filter(c => matchesColorFilter(c, colorFilter))
  const byValue = compareBy(sortVal[sort.key], sort.dir)
  rows = [...rows].sort((a, b) => {
    // Scalable removal always sinks to the bottom - it has no comparable metric.
    if (!!a.scalable !== !!b.scalable) return a.scalable ? 1 : -1
    return byValue(a, b)
  })

  // header is one column's sortable header cell.
  function header(key, label, tip, numeric = true) {
    return <SortHeader sortKey={key} label={label} tip={tip} sort={sort} setSort={setSort} numeric={numeric} />
  }

  const summary = (
    <span className="player-filter-hint">
      {COPY.summary({ rows: rows.length, creatures: data.creature_count, excluded: data.excluded })}
    </span>
  )

  let body = null
  if (tab === "scatter") {
    body = (
      <SectionCard title={COPY.scatterTitle}>
        <RemovalScatter cards={rows} mode={shownMode} />
      </SectionCard>
    )
  } else if (tab === "bycolor") {
    body = <RemovalByColor rows={data.by_color || []} mode={shownMode} />
  } else if (tab === "hard") {
    body = (
      <HardToRemove
        creatures={data.creatures || []}
        byColor={data.by_color || []}
        removalCards={data.removal_cards || 0}
        color={colorFilter}
      />
    )
  } else {
    body = (
      <SectionCard title={COPY.tableTitle} action={summary}>
        <div className="stats-table-wrap">
          <table className="widget-table stats-full-width">
            <thead>
              <tr>
                {header("name", COPY.columns.card, undefined, false)}
                {header("cost", COPY.columns.cost, COPY.columnTips.cost)}
                <HoverInfo title={COPY.columns.kind} info={COPY.columnTips.kind}><td className="header-cell">{COPY.columns.kind}</td></HoverInfo>
                <HoverInfo title={COPY.columns.restriction} info={COPY.columnTips.restriction}><td className="header-cell">{COPY.columns.restriction}</td></HoverInfo>
                {shownMode === "raw"
                  ? header("coverage", COPY.columns.targets, COPY.columnTips.targets)
                  : header("coverage", COPY.columns.percentPlayed, COPY.columnTips.percentPlayed)}
                <HoverInfo title={COPY.columns.maxMv} info={COPY.columnTips.maxMv}><td className="header-cell page-right-cell">{COPY.columns.maxMv}</td></HoverInfo>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.name} className="widget-table-row">
                  <td className="header-cell stats-bold"><CardLink cube={cubeID} name={removalCardName(c.name)}>{c.name}</CardLink></td>
                  <td className="page-right-cell" title={c.mana_cost && c.eff_cost !== c.mv ? COPY.costTitle({ manaCost: c.mana_cost, mv: c.mv }) : c.mana_cost}>
                    {c.eff_cost}{c.eff_cost !== c.mv ? "*" : ""}
                  </td>
                  <td>{c.kind}</td>
                  <td className="stats-muted">{c.restriction}</td>
                  {c.scalable ? (
                    <td className="page-muted-center-cell" colSpan={2}>{COPY.scalable}</td>
                  ) : (
                    <>
                      <td className="page-right-cell">
                        {shownMode === "raw" ? `${c.targets} (${c.pct_cube}%)` : `${c.pct_played}%`}
                      </td>
                      <td className="page-right-cell">{c.max_mv_killed}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    )
  }

  return (
    <>
      {toolbar}
      <div className="analyze-page">
        <TabNav tabs={PAGE_TABS} active={tab} onChange={setTab} />
        {body}
      </div>
    </>
  )
}
