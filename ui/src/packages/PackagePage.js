// A package's own page: its wires, how its groups spread over the colors, how
// often it's built over time, and the decks that built it. The server computes
// everything (/stats/package).

import React, { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { packageUrl } from "../stats/pageRequests.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { BuiltOverTime } from "./BuiltOverTime.js"
import { PackageHeader } from "./PackageHeader.js"
import { ColorSupport, DecksBuilt, RelatedPackages, Wires } from "./PackageSections.js"
import "../pages/pages.css"
import "../cards/cardPage.css"
import "./packagePage.css"

// RANGE_COPY is the date range menu's text.
const RANGE_COPY = {
  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",
}

// usePackagePage loads the package page's data for name over the date range.
// It returns { page, missing }: page is null while loading, and missing is
// true when the rules have no such package.
function usePackagePage(cube, name, start, end) {
  const [state, setState] = useState({ page: null, missing: false })

  useEffect(() => {
    setState({ page: null, missing: false })
    let cancelled = false
    fetch(packageUrl(cube, { name, start, end }))
      .then(r => {
        if (r.status === 404) {
          return { missing: true }
        }
        return r.json()
      })
      .then(body => {
        if (cancelled) {
          return
        }
        if (body.missing) {
          setState({ page: null, missing: true })
        } else {
          setState({ page: body, missing: false })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ page: null, missing: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [cube, name, start, end])

  return state
}

// PackagePage is the page for the package named in the URL. It follows the
// app's date range but not its deck filter; links out set the filter through
// onLinkMatch as they're followed.
export function PackagePage(props) {
  const { name } = useParams()
  const cube = useCube()
  const info = useCubeInfo(cube)
  const start = props.startDate || ""
  const end = props.endDate || ""
  const { page, missing } = usePackagePage(cube, name, start, end)
  const nav = { cube, start, end, onMatch: props.onLinkMatch }

  const toolbar = (
    <PageToolbar title={name}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={RANGE_COPY} />
    </PageToolbar>
  )

  let body = <div className="browse-empty">Loading {name}…</div>
  if (missing) {
    body = <div className="browse-empty">No package named {name}.</div>
  } else if (page) {
    body = (
      <>
        <PackageHeader page={page} info={info} />
        <div className="package-page-grid">
          <div className="card-page-wide">
            <Wires page={page} cube={cube} />
          </div>
          <div className="card-page-wide">
            <ColorSupport page={page} />
          </div>
          <BuiltOverTime overTime={page.over_time} />
          <div className="card-page-stack">
            <RelatedPackages page={page} cube={cube} />
            <DecksBuilt page={page} nav={nav} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {toolbar}
      <div className="card-page">{body}</div>
    </>
  )
}
