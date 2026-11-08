// An archetype's or tag's own page: how its decks did, the cards they play,
// what they're paired with, who builds them, how often, and the decks
// themselves. The server computes everything (/stats/archetype).

import React, { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { UnstyledButton } from "@mantine/core"
import { useCube } from "../contexts/CubeContext.js"
import { useCubeInfo } from "../utils/useCubeWritable.js"
import { hasData } from "../utils/dataKinds.js"
import { ColorImages } from "../utils/Colors.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { DetailHeader } from "../components/kit/DetailHeader.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { StatTile } from "../components/kit/StatTile.js"
import { GamesWon } from "../cards/CardHeader.js"
import { DeckRow } from "../cards/CardPlaySections.js"
import { gamesWonTile } from "../cards/cardPageModel.js"
import { BuiltOverTime } from "../packages/BuiltOverTime.js"
import { archetypePageHref, pageHrefWithMatch } from "../shell/paths.js"
import { ArchetypeTopCards } from "./ArchetypeTopCards.js"
import { archetypeMatch, pageSubtitle, pageTitle, percentOf } from "./archetypePageModel.js"
import "../pages/pages.css"
import "../cards/cardPage.css"
import "../packages/packagePage.css"
import "./archetypePage.css"

// DECKS_SHOWN is how many decks the decks section lists before "Show all".
const DECKS_SHOWN = 10

// useArchetypePage fetches the page's data for name over the date range. It
// returns { page, missing }: page is null while loading, and missing is true
// when no deck has ever carried the name.
function useArchetypePage(cube, name, start, end) {
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
    fetch(`/api/${cube}/stats/archetype?${params}`)
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

// resultTiles are the header's match-result numbers: Bayes win %, decks with
// a winning record, trophies and last places.
function resultTiles(stats) {
  const won = gamesWonTile(stats, "its decks")
  const tiles = []
  if (won) {
    tiles.push(<GamesWon key="won" tile={won} />)
  }
  tiles.push(
    <StatTile key="winning" label="Winning records" value={`${percentOf(stats.winning, stats.count)}%`}
      detail={`${stats.winning} of ${stats.count} decks`} tip="Its decks that finished 2-1 or better." />,
    <StatTile key="trophies" label="Trophies" value={stats.trophies} tip="Its decks that went 3-0." />,
    <StatTile key="last" label="Last places" value={stats.last_place} tip="Its decks that went 0-3." />,
  )
  return tiles
}

// ArchetypeHeader is the page's header band: the name, whether it's a macro
// archetype or a tag, and its numbers. Results tiles show only for cubes that
// record match results.
function ArchetypeHeader({ page, info }) {
  const stats = page.stats
  const tiles = [
    <StatTile key="decks" label="Decks" value={stats.count}
      detail={`${Math.round(stats.build_percent)}% of all decks`} tip="Decks in the date range that carry it." />,
  ]
  if (hasData(info, "results") && stats.count > 0) {
    tiles.push(...resultTiles(stats))
  }
  return <DetailHeader title={pageTitle(page.name)} subtitle={pageSubtitle(page.name)} tiles={tiles} />
}

// TraitChip is one chip in a traits row: a label and count, linking to the
// Decks page filtered to its decks with that trait.
function TraitChip({ label, count, match, nav }) {
  return (
    <Link
      className="kit-chip kit-chip-neutral"
      to={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
      onClick={() => nav.onMatch(match)}
    >
      {label}
      <span className="kit-chip-count">{count}</span>
    </Link>
  )
}

// TraitRow is one labeled row of chips, hidden when it has none.
function TraitRow({ title, entries, chipFor }) {
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="card-trait-row">
      <span className="card-trait-title">{title}</span>
      <div className="kit-chips">{entries.map(chipFor)}</div>
    </div>
  )
}

// PairedTagLink is one paired archetype or tag, linking to its own page.
function PairedTagLink({ entry, cube }) {
  return (
    <Link className="kit-chip kit-chip-neutral" to={archetypePageHref(cube, entry.name)}>
      {pageTitle(entry.name)}
      <span className="kit-chip-count">{entry.count}</span>
    </Link>
  )
}

// WhoBuildsIt shows the other archetypes and tags on its decks, their colors
// and their players.
function WhoBuildsIt({ page, nav }) {
  if (page.decks.length === 0) {
    return null
  }
  const own = archetypeMatch(page.name)
  return (
    <SectionCard title="Who builds it">
      <TraitRow title="Paired with" entries={page.paired} chipFor={e => (
        <PairedTagLink key={e.name} entry={e} cube={nav.cube} />
      )} />
      <TraitRow title="Colors" entries={page.colors} chipFor={e => (
        <TraitChip key={e.name} label={ColorImages(e.name.split(""))} count={e.count} match={`${own} dcolor=${e.name}`} nav={nav} />
      )} />
      <TraitRow title="Players" entries={page.players} chipFor={e => (
        <TraitChip key={e.name} label={e.name} count={e.count} match={`${own} player:"${e.name}"`} nav={nav} />
      )} />
    </SectionCard>
  )
}

// SHARE_TIP explains the share-of-decks chart.
const SHARE_TIP = "Share of each draft's decks that carried it, as dots, and over the last five drafts, as a line. Drafts outside the date range are faded."

// ShareOverTime charts the share of each draft's decks that carried it.
function ShareOverTime({ page }) {
  return <BuiltOverTime overTime={page.over_time} title="Share of decks" tip={SHARE_TIP} />
}

// ItsDecks lists its decks, newest first, showing DECKS_SHOWN until expanded.
function ItsDecks({ page, nav }) {
  const [expanded, setExpanded] = useState(false)
  if (page.decks.length === 0) {
    return null
  }
  let shown = page.decks
  if (!expanded) {
    shown = page.decks.slice(0, DECKS_SHOWN)
  }

  const match = archetypeMatch(page.name)
  return (
    <SectionCard
      title="Its decks"
      linkLabel="All on the Decks page →"
      href={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
      onLinkClick={() => nav.onMatch(match)}
    >
      {shown.map(deck => <DeckRow key={deck.ref} deck={deck} match={match} nav={nav} />)}
      {!expanded && page.decks.length > DECKS_SHOWN && (
        <UnstyledButton className="card-partner-more" onClick={() => setExpanded(true)}>
          Show all {page.decks.length}
        </UnstyledButton>
      )}
    </SectionCard>
  )
}

// ArchetypePage is the page for the archetype or tag named in the URL. Like
// the card page, it follows the app's date range but not its deck filter;
// links out to filtered pages set the filter through onLinkMatch.
export function ArchetypePage(props) {
  const { name } = useParams()
  const cube = useCube()
  const info = useCubeInfo(cube)
  const { page, missing } = useArchetypePage(cube, name, props.startDate, props.endDate)
  const nav = { cube, start: props.startDate, end: props.endDate, onMatch: props.onLinkMatch }

  const toolbar = (
    <PageToolbar title={pageTitle(name)}>
      <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} />
    </PageToolbar>
  )

  let body = <div className="browse-empty">Loading {name}…</div>
  if (missing) {
    body = <div className="browse-empty">No deck has ever been tagged {name}.</div>
  } else if (page) {
    body = (
      <>
        <ArchetypeHeader page={page} info={info} />
        <div className="card-page-grid">
          <div className="card-page-wide">
            <ArchetypeTopCards cards={page.top_cards} cube={cube} />
          </div>
          <WhoBuildsIt page={page} nav={nav} />
          <ShareOverTime page={page} />
          <div className="card-page-wide">
            <ItsDecks page={page} nav={nav} />
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
