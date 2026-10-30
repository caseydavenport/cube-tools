// A card's own page: how it relates to the cube, how it's played, and what
// it interacts with. The server computes everything (/stats/card).

import React, { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { useCube } from "../contexts/CubeContext.js"
import { asEvent } from "../components/kit/controls.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { CardCompare } from "./CardCompare.js"
import { CardHeader } from "./CardHeader.js"
import { CardInteraction } from "./CardInteraction.js"
import { CardPartners } from "./CardPartners.js"
import { DecksPlayed, RecordAndPicks, SameRole, WhoPlaysIt } from "./CardPlaySections.js"
import { PartnerMap } from "./PartnerMap.js"
import { packageIndexOf } from "./cardPageModel.js"
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

// useCompareCard keeps the compared card in the URL as "vs", so a compare can
// be shared. It returns the card and a setter.
function useCompareCard() {
  const [params, setParams] = useSearchParams()
  const vs = params.get("vs") || ""

  // setVs writes the compared card, or removes it when given "".
  function setVs(name) {
    const next = new URLSearchParams(params)
    if (name) {
      next.set("vs", name)
    } else {
      next.delete("vs")
    }
    setParams(next, { replace: true })
  }

  return [vs, setVs]
}

// CardSections are the sections under the header: partners beside the
// partner map, the compare, then who plays the card and what it interacts
// with, its decks, and its record and picks. Empty sections hide themselves.
function CardSections({ page, cube, start, end, onMatch }) {
  const [vs, setVs] = useCompareCard()
  const info = useCubeInfo(cube)
  const packageIndex = useMemo(() => packageIndexOf(page.package_names), [page.package_names])
  const nav = { cube, start, end, onMatch }
  const partnerLinks = { ...nav, onCompare: setVs }

  return (
    <div className="card-page-grid">
      <CardPartners page={page} packageIndex={packageIndex} links={partnerLinks} />
      <PartnerMap page={page} packageIndex={packageIndex} cube={cube} />
      <div className="card-page-wide">
        <CardCompare card={page.card.name} vs={vs} onVs={setVs} packageIndex={packageIndex} nav={nav} />
      </div>
      <WhoPlaysIt page={page} info={info} nav={nav} />
      <div className="card-page-stack">
        <SameRole page={page} cube={cube} />
        <CardInteraction page={page} cube={cube} />
      </div>
      <DecksPlayed page={page} nav={nav} />
      <RecordAndPicks page={page} info={info} />
    </div>
  )
}

// CardPage is the page for the card named in the URL. It follows the app's
// date range but not its deck filter; links out to filtered pages set the
// filter through onMatch as they're followed.
export function CardPage(props) {
  const { name } = useParams()
  const cube = useCube()
  const { page, missing } = useCardPage(cube, name, props.startDate, props.endDate)
  const onMatch = value => props.onMatchUpdated(asEvent(value))

  const toolbar = (
    <PageToolbar title={name}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={RANGE_COPY} />
    </PageToolbar>
  )

  let body = <div className="browse-empty">Loading {name}…</div>
  if (missing) {
    body = <div className="browse-empty">No card named {name}.</div>
  } else if (page) {
    body = (
      <>
        <CardHeader page={page} />
        <CardSections page={page} cube={cube} start={props.startDate} end={props.endDate} onMatch={onMatch} />
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
