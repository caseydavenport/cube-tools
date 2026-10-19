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

// WinnerCell shows who won a draft: a trophy, their colors, name, and record.
function WinnerCell({ winner }) {
  if (!winner) {
    return null
  }
  return (
    <div className="home-winner">
      <div className="home-winner-name">
        <IconTrophy size={14} stroke={1.8} className="home-trophy" />
        {ColorImages(winner.colors)}
        <span>{winner.player}</span>
      </div>
      <Text className="home-muted-small">{winner.record}</Text>
    </div>
  )
}

// DraftRow is one recent draft. Drafts with a pick log link to the Drafts page,
// which can only open those; the rest are plain rows for now.
function DraftRow({ cube, draft, copy }) {
  const content = (
    <>
      <DateBadge badge={draft.badge} />
      <div className="home-row-main">
        <Text fw={600} size="sm" truncate>{draft.name}</Text>
        <Text className="home-muted-small">{draft.players} {copy.players}</Text>
      </div>
      <WinnerCell winner={draft.winner} />
    </>
  )

  if (draft.hasLog) {
    return (
      <UnstyledButton component={Link} to={`${pageHref(cube, "drafts")}?draft=${draft.id}`} className="home-row home-row-link">
        {content}
      </UnstyledButton>
    )
  }
  return <div className="home-row">{content}</div>
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
