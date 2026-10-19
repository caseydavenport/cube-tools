import React from "react"
import { useCube } from "../contexts/CubeContext.js"
import { useArrowNav } from "../hooks/useArrowNav.js"
import { ListDetail, ListRow } from "../components/kit/ListDetail.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { useDraftsPage } from "../drafts/useDraftsPage.js"
import { DraftDetails } from "../drafts/DraftDetails.js"
import "../decks/decks.css"
import "../drafts/drafts.css"

// COPY holds every piece of text on the Drafts page. These are placeholders for
// Casey to replace.
const COPY = {
  title: "Drafts",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",

  pickDraft: "Pick a draft from the list",
  noDrafts: "No drafts in this date range",
  loading: "Loading…",
  error: "Couldn't load drafts",

  players: "players",
  seat: "Seat",
  noWinner: "No winner recorded",
  seeDecks: "See this draft's decks",

  pickLog: "Pick log",
  noPickLog: "No pick log for this draft",
  player: "Player",
  choosePlayer: "Choose a player",
  pick: "Pick",
}

// winnerText is the muted detail at the right of a draft's row: who won.
function winnerText(winner, copy) {
  if (!winner) {
    return ""
  }
  if (winner.player) {
    return winner.player
  }
  return `${copy.seat} ${winner.seat}`
}

// DraftListPane is the left pane: one row per draft in the date range.
function DraftListPane({ page, copy }) {
  if (page.error) {
    return <EmptyState>{copy.error}</EmptyState>
  }
  if (page.loading) {
    return <EmptyState>{copy.loading}</EmptyState>
  }
  if (page.drafts.length === 0) {
    return <EmptyState>{copy.noDrafts}</EmptyState>
  }

  return page.drafts.map(draft => (
    <ListRow
      key={draft.id}
      href={`?draft=${draft.id}`}
      selected={String(draft.id) === page.selectedId}
      primary={draft.label}
      secondary={winnerText(draft.winner, copy)}
    />
  ))
}

// DraftsPage lists every draft in the date range, with the selected draft's
// summary and pick log beside it. props carry the app-wide date range.
export function DraftsPage(props) {
  const cube = useCube()
  const page = useDraftsPage(cube, props)

  // The left and right arrow keys step through the list.
  useArrowNav(page.drafts, page.selectedId, draft => String(draft.id), page.select)

  return (
    <>
      <PageToolbar title={COPY.title}>
        <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={COPY} />
      </PageToolbar>

      <ListDetail
        list={<DraftListPane page={page} copy={COPY} />}
        detail={<DraftDetails page={page} copy={COPY} />}
      />
    </>
  )
}
