import React, { useState, useEffect } from 'react'
import { Select } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
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
import { ShareBar } from "../components/kit/ShareBar.js"
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
  tableTitle: "Packages",
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

  summary: ({ packages, populated }) => `${packages} packages · ${populated} populated decks`,

  columns: {
    label: "Package",
    buildRate: "Build rate",
    packages: "Packages",
    has3: "Has 3+",
    commitment: "Commitment",
  },

  columnTips: {
    buildRate: "Packages built divided by populated decks, those with any non-basic mainboard card. Hover a cell for its interval at the chosen confidence.",
    packages: "Decks that built this package: 2 or more cards on each side of one of its wires (1 for a side with a single card), 3 or more cards in all.",
    has3: "Decks carrying at least three of this package's cards.",
    commitment: "Package decks divided by has-3 decks: how often the cards, once present, form a package. Low means the cards show up but rarely come together.",
  },

  tooltips: {
    buildRate: ({ packages, populated }) => `${packages} of ${populated} populated decks built this package`,
    buildRateLabel: ({ level }) => `${level}% CI`,
    buildRateRange: ({ rate, low, high }) => `${rate} (${low}–${high})`,
    has3: ({ has3, rate }) => `${has3} decks carry 3+ of this package's cards (${rate} of populated)`,
    commitment: "package decks / has-3 decks: how often the cards, once present, actually form a package",
  },
}

// The Packages page shows how often decks build each package. Build rate is
// built decks over populated decks; commitment is built decks over decks with
// 3+ of the package's cards. /stats/packages computes them; this page renders
// a sortable table.

const pct = v => `${Math.round(v * 100)}%`

// BuildRateCell is a label's build rate with a bar under it, and the sample
// size and the confidence interval behind it on hover.
function BuildRateCell({ s, populated, confidence }) {
  const level = Math.round(parseFloat(confidence || "0.8") * 100)
  const rows = [{
    label: COPY.tooltips.buildRateLabel({ level }),
    value: COPY.tooltips.buildRateRange({ rate: pct(s.buildRate), low: pct(s.buildRateLow), high: pct(s.buildRateHigh) }),
  }]

  return (
    <HoverStats title={COPY.tooltips.buildRate({ packages: s.package, populated })} rows={rows}>
      <td className="page-right-cell">
        {pct(s.buildRate)}
        <ShareBar share={s.buildRate} />
      </td>
    </HoverStats>
  )
}

// Packages is the Packages page: the toolbar with its date range, deck filter,
// and confidence setting, then the table of packages.
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
    name: s => s.name.toLowerCase(),
    package: s => s.package,
    buildRate: s => s.buildRate,
    has3: s => s.has3,
    cameTogether: s => s.cameTogether,
  }

  const rows = [...(data.packages || [])].sort(compareBy(sortVal[sort.key], sort.dir))

  // header is one column's sortable header cell.
  function header(key, label, tip, numeric = true) {
    return <SortHeader sortKey={key} label={label} tip={tip} sort={sort} setSort={setSort} numeric={numeric} />
  }

  const summary = (
    <span className="player-filter-hint">
      {COPY.summary({ packages: rows.length, populated: data.populatedDecks })}
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
              {header("name", COPY.columns.label, undefined, false)}
              {header("buildRate", COPY.columns.buildRate, COPY.columnTips.buildRate)}
              {header("package", COPY.columns.packages, COPY.columnTips.packages)}
              {header("has3", COPY.columns.has3, COPY.columnTips.has3)}
              {header("cameTogether", COPY.columns.commitment, COPY.columnTips.commitment)}
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.name} className="widget-table-row">
                <td className="header-cell stats-bold">{s.name}</td>
                <BuildRateCell s={s} populated={data.populatedDecks} confidence={confidence} />
                <td className="page-right-cell">{s.package}</td>
                <HoverInfo info={COPY.tooltips.has3({ has3: s.has3, rate: pct(s.has3Rate) })}>
                  <td className="page-right-cell">
                    {s.has3} <span className="stats-muted">({pct(s.has3Rate)})</span>
                  </td>
                </HoverInfo>
                <HoverInfo info={COPY.tooltips.commitment}>
                  <td className="page-right-cell">
                    {s.cameTogether.toFixed(2)}
                    <ShareBar share={s.cameTogether} />
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
      </div>
    </>
  )
}
