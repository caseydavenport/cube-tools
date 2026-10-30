// A card's own page: how it relates to the cube, how it's played, and what
// it interacts with. The server computes everything (/stats/card).

import React, { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { CardHeader } from "./CardHeader.js"
import "../pages/pages.css"
import "./cardPage.css"

// RANGE_COPY is the date range menu's text.
const RANGE_COPY = {
  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",
}

// useCardPage fetches the card page's data for name over the date range. It
// returns { page, missing }: page is null while loading, and missing is true
// when the server doesn't know the name.
function useCardPage(cube, name, start, end) {
  const [state, setState] = useState({ page: null, missing: false })

  useEffect(() => {
    setState({ page: null, missing: false })
    const params = new URLSearchParams()
    params.set("name", name)
    if (start) {
      params.set("start", start)
    }
    if (end) {
      params.set("end", end)
    }

    let cancelled = false
    fetch(`/api/${cube}/stats/card?${params}`)
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

// CardPage is the page for the card named in the URL. It follows the app's
// date range but not its deck filter.
export function CardPage(props) {
  const { name } = useParams()
  const cube = useCube()
  const { page, missing } = useCardPage(cube, name, props.startDate, props.endDate)

  const toolbar = (
    <PageToolbar title={name}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={RANGE_COPY} />
    </PageToolbar>
  )

  let body = <div className="browse-empty">Loading {name}…</div>
  if (missing) {
    body = <div className="browse-empty">No card named {name}.</div>
  } else if (page) {
    body = <CardHeader page={page} />
  }

  return (
    <>
      {toolbar}
      <div className="card-page">{body}</div>
    </>
  )
}
