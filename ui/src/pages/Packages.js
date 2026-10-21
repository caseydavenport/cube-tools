import React, { useState, useEffect } from 'react'
import { Select } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { RichText } from "../components/kit/RichText.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { HoverStats } from "../components/kit/HoverStats.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { SortHeader } from "../stats/sortHeader.js"
import { compareBy } from "../stats/sortOrder.js"
import { startLoad } from "../stats/loading.js"
import { packagesUrl } from "../stats/pageRequests.js"
import { goodBadTint } from "../stats/tints.js"
import { useFilterSuggestions } from "../stats/useFilterSuggestions.js"
import { useDebouncedFilter } from "../hooks/useDebouncedFilter.js"
import { fetchJson } from "../utils/fetchJson.js"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"
import "../stats/stats.css"
import "./pages.css"

// COPY holds the text this page adds around its table. Placeholders for Casey
// to replace.
const COPY = {
  title: "Packages",
  tableTitle: "Rule labels",
  settings: "Settings",
  confidence: "Build-rate confidence",
  filterPlaceholder: "Filter decks",
  noPackages: "No packages in these decks.",
  loading: "Loading packages…",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",

  summary: ({ labels, populated }) => `${labels} labels · ${populated} populated decks`,

  columns: {
    label: "Label",
    buildRate: "Build rate",
    packages: "Packages",
    has3: "Has 3+",
    commitment: "Commitment",
  },

  columnTips: {
    buildRate: "Packages built divided by populated decks.",
    packages: "Decks where this label's cards clustered into a package of three or more cards.",
    has3: "Decks carrying at least three cards that touch this label.",
    commitment: "Package decks divided by has-3 decks: how often the cards, once present, form a package.",
  },

  tooltips: {
    buildRate: ({ packages, populated }) => `${packages} of ${populated} populated decks built this package`,
    buildRateLabel: ({ level }) => `${level}% CI`,
    buildRateRange: ({ rate, low, high }) => `${rate} (${low}–${high})`,
    has3: ({ has3, rate }) => `${has3} decks carry 3+ of this label's cards (${rate} of populated)`,
    commitment: "package decks / has-3 decks: how often the cards, once present, actually form a package",
  },

  hint: [
    "A deck is ",
    { bold: "populated" },
    " if it has any non-basic mainboard card. ",
    { bold: "Has 3+" },
    " counts decks carrying at least three cards that touch a label; a ",
    { bold: "package" },
    " is when those cards cluster into a cohesive community (size 3+) whose dominant label is this one. ",
    { bold: "Build rate" },
    " is packages over populated decks (with a Wilson interval at the chosen confidence);",
    { bold: " commitment" },
    " is packages over has-3 decks - low means the cards show up but rarely cohere.",
  ],
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

// BuildRateCell is a label's build rate, tinted by the rate, with the sample
// size and the confidence interval behind it on hover.
function BuildRateCell({ s, populated, confidence }) {
  const level = Math.round(parseFloat(confidence || "0.8") * 100)
  const rows = [{
    label: COPY.tooltips.buildRateLabel({ level }),
    value: COPY.tooltips.buildRateRange({ rate: pct(s.buildRate), low: pct(s.buildRateLow), high: pct(s.buildRateHigh) }),
  }]

  return (
    <HoverStats title={COPY.tooltips.buildRate({ packages: s.package, populated })} rows={rows}>
      <td style={{ textAlign: "right", background: rateColor(s.buildRate) }}>
        {pct(s.buildRate)}
      </td>
    </HoverStats>
  )
}

// Packages is the Packages page: the toolbar with its date range, deck filter,
// and confidence setting, then the table of rule labels.
export function Packages(props) {
  const cubeID = useCube()
  const start = props.startDate || ""
  const end = props.endDate || ""
  const [data, setData] = useState(null)
  const [confidence, setConfidence] = useState("0.8")
  const [sort, setSort] = useState({ key: "buildRate", dir: "desc" })
  const filter = useDebouncedFilter(props.matchStr, props.onMatchUpdated)
  const { suggestions } = useFilterSuggestions(cubeID, start, end)

  useEffect(() => {
    const url = packagesUrl(cubeID, { confidence, start, end, match: filter.settled })

    // Returning cancel drops an answer for an older filter that arrives late.
    return startLoad(() => fetchJson(url), setData, () => setData(null))
  }, [cubeID, confidence, start, end, filter.settled])

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
      <PillSearchInput
        placeholder={COPY.filterPlaceholder}
        value={filter.typed}
        onChange={event => filter.setTyped(event.target.value)}
        {...suggestions}
      />
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

  const sortVal = {
    label: s => s.label.toLowerCase(),
    package: s => s.package,
    buildRate: s => s.buildRate,
    has3: s => s.has3,
    commitmentRatio: s => s.commitmentRatio,
  }

  const rows = [...(data.packages || [])].sort(compareBy(sortVal[sort.key], sort.dir))

  // header is one column's sortable header cell.
  function header(key, label, tip, numeric = true) {
    return <SortHeader sortKey={key} label={label} tip={tip} sort={sort} setSort={setSort} numeric={numeric} />
  }

  const summary = (
    <span className="player-filter-hint">
      {COPY.summary({ labels: rows.length, populated: data.populatedDecks })}
    </span>
  )

  // A filter that matches no packaged decks shows a line, not a bare header.
  let table
  if (rows.length === 0) {
    table = <div className="browse-empty">{COPY.noPackages}</div>
  } else {
    table = (
      <div className="stats-table-wrap">
        <table className="widget-table stats-full-width">
          <thead>
            <tr>
              {header("label", COPY.columns.label, undefined, false)}
              {header("buildRate", COPY.columns.buildRate, COPY.columnTips.buildRate)}
              {header("package", COPY.columns.packages, COPY.columnTips.packages)}
              {header("has3", COPY.columns.has3, COPY.columnTips.has3)}
              {header("commitmentRatio", COPY.columns.commitment, COPY.columnTips.commitment)}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.label} className="widget-table-row">
                <td className="header-cell stats-bold">{s.label}</td>
                <BuildRateCell s={s} populated={data.populatedDecks} confidence={confidence} />
                <td className="page-right-cell">{s.package}</td>
                <HoverInfo info={COPY.tooltips.has3({ has3: s.has3, rate: pct(s.has3Rate) })}>
                  <td className="page-right-cell">
                    {s.has3} <span className="stats-muted">({pct(s.has3Rate)})</span>
                  </td>
                </HoverInfo>
                <HoverInfo info={COPY.tooltips.commitment}>
                  <td style={{ textAlign: "right", background: rateColor(s.commitmentRatio) }}>
                    {s.commitmentRatio.toFixed(2)}
                  </td>
                </HoverInfo>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      {toolbar}
      <div className="analyze-page">
        <SectionCard title={COPY.tableTitle} action={summary}>
          {table}
        </SectionCard>
        <p className="player-filter-hint stats-section-gap">
          <RichText parts={COPY.hint} />
        </p>
      </div>
    </>
  )
}
