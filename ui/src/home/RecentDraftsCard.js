import React from "react"
import { Link } from "react-router-dom"
import { Text, UnstyledButton } from "@mantine/core"
import { IconTrophy } from "@tabler/icons-react"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { ColorImages } from "../utils/Colors.js"
import { pageHref } from "../shell/paths.js"
import { HOME_BLOCKS, blockState } from "./homeBlocks.js"
import { BlockBody } from "./BlockBody.js"

// DateBadge is the small day-and-month square at the start of a draft row.
function DateBadge({ badge }) {
  if (!badge) {
    return <div className="home-date-badge" />
  }
  return (
    <div className="home-date-badge">
      <span className="home-date-day">{badge.day}</span>
      <span className="home-date-month">{badge.month}</span>
    </div>
  )
}

// winnerName is how a winner is named: the player, or for an anonymous seat,
// "Seat 6" (seat labels like "p6" repeat in every draft).
function winnerName(winner, copy) {
  if (winner.player) {
    return winner.player
  }
  return `${copy.seat} ${winner.seat}`
}

// WinnerCell shows who won a draft: their colors, name, and record. The trophy
// appears only for an undefeated deck, matching what a trophy means elsewhere.
function WinnerCell({ winner, copy }) {
  if (!winner) {
    return null
  }
  return (
    <div className="home-winner">
      <div className="home-winner-name">
        {winner.undefeated && <IconTrophy size={14} stroke={1.8} className="home-trophy" />}
        {ColorImages(winner.colors)}
        <span>{winnerName(winner, copy)}</span>
      </div>
      <Text className="home-muted-small">{winner.record}</Text>
    </div>
  )
}

// DraftRow is one recent draft, linking to it on the Drafts page.
function DraftRow({ cube, draft, copy }) {
  const content = (
    <>
      <DateBadge badge={draft.badge} />
      <div className="home-row-main">
        <Text fw={600} size="sm" truncate>{draft.name}</Text>
        <Text className="home-muted-small">{draft.players} {copy.players}</Text>
      </div>
      <WinnerCell winner={draft.winner} copy={copy} />
    </>
  )

  return (
    <UnstyledButton component={Link} to={`${pageHref(cube, "drafts")}?draft=${draft.id}`} className="home-row home-row-link">
      {content}
    </UnstyledButton>
  )
}

// RecentDraftsCard lists the cube's newest drafts with their winners.
export function RecentDraftsCard({ cube, home, info, copy }) {
  return (
    <SectionCard title={copy.recentDrafts} linkLabel={copy.allDrafts} href={pageHref(cube, "drafts")}>
      <BlockBody
        state={blockState(HOME_BLOCKS.recentDrafts, info)}
        value={home.recent}
        error={home.errors.decks || home.errors.index}
        errorText={copy.error}
        loadingHeight={240}
        render={drafts => {
          if (drafts.length === 0) {
            return <EmptyState>{copy.noData}</EmptyState>
          }
          return drafts.map(d => <DraftRow key={d.id} cube={cube} draft={d} copy={copy} />)
        }}
      />
    </SectionCard>
  )
}
