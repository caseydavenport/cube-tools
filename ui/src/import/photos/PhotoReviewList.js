import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Anchor, Badge, Group, UnstyledButton } from "@mantine/core"
import { useCube } from "../../contexts/CubeContext.js"
import { EmptyState } from "../../components/kit/EmptyState.js"
import { draftLabel } from "../../utils/DraftInfo.js"
import { loadPhotoDrafts } from "../importApi.js"
import { errorText } from "../useAction.js"

// plural adds an "s" to word unless count is one.
function plural(count, word) {
  if (count === 1) {
    return `${count} ${word}`
  }
  return `${count} ${word}s`
}

// isFinished says whether a photo draft needs nothing more: every seat has a
// confirmed deck, none is stale, and the cards add up against the cube.
// Warnings alone don't count, since they flag decks worth a look, not errors.
function isFinished(summary) {
  const allConfirmed = summary.players > 0 && summary.confirmed >= summary.players
  return allConfirmed && summary.reconfirm_needed === 0 && summary.conflicts === 0
}

// DraftBadges shows a photo draft's progress and anything that needs a look.
function DraftBadges({ summary }) {
  let progressColor = "gray"
  if (summary.confirmed >= summary.players) {
    progressColor = "green"
  }

  return (
    <Group gap={6} wrap="nowrap">
      {summary.conflicts > 0 && (
        <Badge color="red" variant="light">{plural(summary.conflicts, "problem")}</Badge>
      )}
      {summary.reconfirm_needed > 0 && (
        <Badge color="orange" variant="light">{summary.reconfirm_needed} to reconfirm</Badge>
      )}
      {summary.warnings > 0 && (
        <Badge color="yellow" variant="light">{plural(summary.warnings, "warning")}</Badge>
      )}
      <Badge color={progressColor} variant="light">{summary.confirmed} of {summary.players} confirmed</Badge>
    </Group>
  )
}

// DraftRows lists photo drafts, each linking to its review page.
function DraftRows({ summaries }) {
  const cube = useCube()

  return (
    <ul className="import-rows">
      {summaries.map((summary) => (
        <li key={summary.draft.id}>
          <UnstyledButton component={Link} to={`/${cube}/import/review/${summary.draft.id}`} className="import-row">
            <span className="import-row-title">{draftLabel(summary.draft)}</span>
            <DraftBadges summary={summary} />
          </UnstyledButton>
        </li>
      ))}
    </ul>
  )
}

// PhotoReviewList lists the drafts brought in from photos. Drafts that still
// need work come first; finished ones fold behind a toggle.
export function PhotoReviewList() {
  const cube = useCube()
  const [summaries, setSummaries] = useState(null)
  const [error, setError] = useState("")
  const [showFinished, setShowFinished] = useState(false)

  useEffect(() => {
    // alive stops a reply for a cube we've since left from landing.
    let alive = true
    loadPhotoDrafts(cube)
      .then((list) => {
        if (alive) {
          setSummaries(list)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorText(e))
        }
      })
    return () => {
      alive = false
    }
  }, [cube])

  if (error) {
    return <EmptyState>Couldn't load the photo drafts: {error}</EmptyState>
  }
  if (summaries === null) {
    return <EmptyState>Loading…</EmptyState>
  }
  if (summaries.length === 0) {
    return <EmptyState>No drafts from photos yet.</EmptyState>
  }

  const open = summaries.filter((summary) => !isFinished(summary))
  const finished = summaries.filter(isFinished)

  return (
    <>
      {open.length > 0 && <DraftRows summaries={open} />}
      {open.length === 0 && <EmptyState>Every photo draft is finished.</EmptyState>}

      {finished.length > 0 && (
        <Anchor component="button" size="sm" c="dimmed" className="import-toggle" onClick={() => setShowFinished(!showFinished)}>
          {showFinished ? "Hide" : "Show"} {plural(finished.length, "finished draft")}
        </Anchor>
      )}
      {showFinished && <DraftRows summaries={finished} />}
    </>
  )
}
