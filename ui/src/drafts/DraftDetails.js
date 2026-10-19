import React from "react"
import { Link } from "react-router-dom"
import { Anchor, Text } from "@mantine/core"
import { IconTrophy } from "@tabler/icons-react"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { ColorImages } from "../utils/Colors.js"
import { pageHref } from "../shell/paths.js"
import { pickLogSection } from "./draftList.js"
import { PickLogBrowser } from "./PickLogBrowser.js"

// WinnerName names the draft's winner, linking to their Players page when they
// are in the player list. An anonymous seat is named by its seat number.
function WinnerName({ cube, winner, copy }) {
  if (!winner.player) {
    return <span>{copy.seat} {winner.seat}</span>
  }
  if (winner.playerId) {
    return (
      <Anchor component={Link} to={`${pageHref(cube, "players")}?player=${winner.playerId}`} fw={600}>
        {winner.player}
      </Anchor>
    )
  }
  return <span>{winner.player}</span>
}

// Winner is the winner line: trophy (for an undefeated deck), colors, name, and
// record.
function Winner({ cube, winner, copy }) {
  if (!winner) {
    return <Text className="deck-muted">{copy.noWinner}</Text>
  }
  return (
    <div className="draft-winner">
      {winner.undefeated && <IconTrophy size={16} stroke={1.8} />}
      <span className="deck-mana">{ColorImages(winner.colors)}</span>
      <WinnerName cube={cube} winner={winner} copy={copy} />
      <span className="deck-muted">{winner.record}</span>
    </div>
  )
}

// DraftSummary is the top card: the draft's name, date, and player count, its
// winner, and a link to its decks.
function DraftSummary({ cube, draft, copy }) {
  return (
    <section className="kit-card deck-identity">
      <div className="deck-identity-main">
        <h2 className="deck-player">{draft.label}</h2>
        <Text className="deck-muted">{draft.date} · {draft.players} {copy.players}</Text>
        <Winner cube={cube} winner={draft.winner} copy={copy} />
      </div>
      {draft.firstDeckRef && (
        <Anchor component={Link} to={`${pageHref(cube, "decks")}?deck=${draft.firstDeckRef}`} size="sm" fw={600}>
          {copy.seeDecks}
        </Anchor>
      )}
    </section>
  )
}

// PickLogCard holds the pick log browser once the log loads.
function PickLogCard({ draft, log, copy }) {
  let body = <EmptyState>{copy.loading}</EmptyState>
  if (log.error) {
    body = <EmptyState>{copy.error}</EmptyState>
  } else if (log.data) {
    // The pack widget finds a log by its draft id, so attach it here.
    body = <PickLogBrowser log={{ ...log.data, draft: { id: draft.id } }} copy={copy} />
  }
  return <SectionCard title={copy.pickLog}>{body}</SectionCard>
}

// DraftDetails fills the details pane for the selected draft: its summary,
// then the pick log area that pickLogSection chooses (the browser, a note
// that this draft has no log, or nothing on cubes without logs).
export function DraftDetails({ page, copy }) {
  const draft = page.selected
  if (!draft) {
    return <EmptyState>{copy.pickDraft}</EmptyState>
  }

  const section = pickLogSection(page.cubeHasLogs, draft.hasLog)

  return (
    <div className="deck-details">
      <DraftSummary cube={page.cube} draft={draft} copy={copy} />
      {section === "browser" && <PickLogCard draft={draft} log={page.log} copy={copy} />}
      {section === "empty" && (
        <SectionCard title={copy.pickLog}>
          <EmptyState>{copy.noPickLog}</EmptyState>
        </SectionCard>
      )}
    </div>
  )
}
