// The Packages index: every package in the rules, as a table comparing how
// often decks build them or as a map of how they share groups.

import React, { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { SegmentedControl, Select } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { SettingsPopover } from "../components/kit/SettingsPopover.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { startLoad } from "../stats/loading.js"
import { packagesUrl } from "../stats/pageRequests.js"
import { useFilterSuggestions } from "../stats/useFilterSuggestions.js"
import { useDebouncedFilter } from "../hooks/useDebouncedFilter.js"
import { fetchJson } from "../utils/fetchJson.js"
import { hasData } from "../utils/dataKinds.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { WIN_CONFIDENCE_OPTS } from "../utils/Stats.js"
import { PackagesMap } from "./PackagesMap.js"
import { PackagesTable } from "./PackagesTable.js"
import { viewFrom } from "./packagesModel.js"
import "../stats/stats.css"
import "../pages/pages.css"
import "./packages.css"

// RANGE_COPY is the date range menu's text.
const RANGE_COPY = {
  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",
}

// useView keeps the Table/Map choice in the URL's ?view=, so a link or a
// refresh opens the same view.
function useView(hasDecks) {
  const [params, setParams] = useSearchParams()
  const view = viewFrom(params, hasDecks)

  // setView writes the view, keeping the URL's other params.
  function setView(next) {
    const updated = new URLSearchParams(params)
    updated.set("view", next)
    setParams(updated, { replace: true })
  }
  return [view, setView]
}

// PackagesPage is the Packages index. It follows the app's date range and
// deck filter.
export function PackagesPage(props) {
  const cube = useCube()
  const info = useCubeInfo(cube)
  const hasDecks = hasData(info, "decks")
  const [view, setView] = useView(hasDecks)
  const start = props.startDate || ""
  const end = props.endDate || ""
  const [data, setData] = useState(null)
  const [confidence, setConfidence] = useState("0.8")
  const [sort, setSort] = useState({ key: "built", dir: "desc" })
  const filter = useDebouncedFilter(props.matchStr, props.onMatchUpdated)
  const { suggestions } = useFilterSuggestions(cube, start, end)

  useEffect(() => {
    const url = packagesUrl(cube, { confidence, start, end, match: filter.settled })

    // Returning cancel drops an answer for an older filter that arrives late.
    return startLoad(() => fetchJson(url), setData, () => setData(null))
  }, [cube, confidence, start, end, filter.settled])

  const settings = (
    <SettingsPopover label="Settings">
      <Select
        size="xs"
        label="Interval confidence"
        data={WIN_CONFIDENCE_OPTS}
        value={confidence}
        onChange={setConfidence}
        allowDeselect={false}
        comboboxProps={{ withinPortal: false }}
      />
    </SettingsPopover>
  )

  const toolbar = (
    <PageToolbar title="Packages" actions={settings}>
      <SegmentedControl
        size="xs"
        value={view}
        onChange={setView}
        data={[{ label: "Table", value: "table" }, { label: "Map", value: "map" }]}
      />
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={RANGE_COPY} />
      <PillSearchInput
        placeholder="Filter decks"
        value={filter.typed}
        onChange={event => filter.setTyped(event.target.value)}
        {...suggestions}
      />
    </PageToolbar>
  )

  let body = <div className="browse-empty">Loading packages…</div>
  if (data && view === "map") {
    body = <PackagesMap data={data} cube={cube} hasDecks={hasDecks} />
  } else if (data) {
    const nav = { cube, start, end, onLinkMatch: props.onLinkMatch }
    const summary = <span className="player-filter-hint">{data.packages.length} packages · {data.populatedDecks} decks</span>
    body = (
      <SectionCard title="Packages" action={summary}>
        <PackagesTable
          data={data}
          nav={nav}
          confidence={confidence}
          sort={sort}
          setSort={setSort}
          showGames={hasData(info, "results")}
        />
      </SectionCard>
    )
  }

  return (
    <>
      {toolbar}
      <div className="analyze-page">{body}</div>
    </>
  )
}
