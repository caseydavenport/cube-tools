import React, { useState } from "react"
import { Button, Group, Text, UnstyledButton } from "@mantine/core"
import { loadSession, saveSession } from "../importApi.js"
import { problemCount, problemKind } from "../ConsistencyPanel.js"
import { CardSearch } from "../CardSearch.js"
import { deriveList } from "./reconcile.js"
import { Snippet } from "./Snippet.js"

// MISSING_PICKS caps how many unseen cards a fix offers as one-click renames.
const MISSING_PICKS = 6

// applyCaptureFix renames or removes one box behind a problem, then works the
// seat's lists out again so the next check sees the change. The server saves
// work a seat at a time, so this loads the seat's work, changes the one box and
// saves the seat back. A newName of null removes the box, for a stray detection.
async function applyCaptureFix(cube, draftId, capture, newName) {
  const session = await loadSession(cube, draftId)
  const work = (session.players && session.players[capture.player]) || {}
  const boxes = work.boxes || {}
  const photoBoxes = boxes[capture.photo] || []

  let updated
  if (newName === null) {
    updated = photoBoxes.filter((box) => box.id !== capture.box_id)
  } else {
    updated = photoBoxes.map((box) => (box.id === capture.box_id ? { ...box, chosen: newName, status: "high" } : box))
  }
  const newBoxes = { ...boxes, [capture.photo]: updated }

  await saveSession(cube, draftId, {
    draft_id: draftId,
    players: {
      [capture.player]: {
        ...work,
        status: work.status || "in_progress",
        boxes: newBoxes,
        pool_entries: deriveList(newBoxes, work.overrides || {}),
        mainboard_entries: deriveList(work.deck_boxes || {}, work.deck_overrides || {}),
      },
    },
  })
}

// CaptureFix is one box behind a problem: its crop from the photo, its seat and
// the name it was given, with ways to fix it. A card counted too often is
// usually a misread of a card not seen yet, so those come first as one-click
// renames, then the box's own close guesses, then a search, or removal.
function CaptureFix({ capture, cube, draftId, cards, missingNames, onFixed, onError }) {
  const [busy, setBusy] = useState(false)
  const guesses = (capture.candidates || []).filter((guess) => guess.name !== capture.chosen).slice(0, 3)

  async function fix(newName) {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      await applyCaptureFix(cube, draftId, capture, newName)
      await onFixed()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={busy ? "kit-card import-capture busy" : "kit-card import-capture"}>
      <Group gap="sm" wrap="nowrap">
        <Snippet cube={cube} draftId={draftId} source={{ photo: capture.photo, box: capture.bbox }} width={264} height={56} />
        <div className="import-grow">
          <Text size="xs" c="dimmed" tt="uppercase">{capture.player}</Text>
          <Text fw={600}>{capture.chosen}</Text>
        </div>
        <Button size="compact-xs" variant="default" color="red" onClick={() => fix(null)} disabled={busy}>Remove</Button>
      </Group>

      {missingNames.length > 0 && (
        <Group gap={4} mt={6}>
          <Text size="xs" c="dimmed">Not seen yet:</Text>
          {missingNames.slice(0, MISSING_PICKS).map((name) => (
            <Button key={name} size="compact-xs" variant="light" color="green" onClick={() => fix(name)} disabled={busy}>{name}</Button>
          ))}
        </Group>
      )}
      {guesses.length > 0 && (
        <Group gap={4} mt={6}>
          {guesses.map((guess) => (
            <Button key={guess.name} size="compact-xs" variant="default" onClick={() => fix(guess.name)} disabled={busy}>
              {guess.name}{guess.score != null ? ` (${guess.score.toFixed(2)})` : ""}
            </Button>
          ))}
        </Group>
      )}
      <div className="import-capture-search">
        <CardSearch cards={cards} onPick={fix} placeholder="Rename to…" />
      </div>
    </li>
  )
}

// FixableProblem is a problem row that opens to the boxes behind it, each with
// a fix. missingNames are the cards not seen yet, offered as renames.
export function FixableProblem({ discrepancy, cube, draftId, cards, missingNames, onFixed, onError }) {
  const [open, setOpen] = useState(false)
  const captures = discrepancy.captures || []

  return (
    <li className="import-problem fixable">
      <UnstyledButton className="import-problem-toggle" onClick={() => setOpen(!open)} disabled={captures.length === 0}>
        <span className="import-problem-kind">{problemKind(discrepancy)}</span>
        <span className="import-problem-name">{discrepancy.card_name}</span>
        <span className="import-muted">{problemCount(discrepancy)}</span>
        {captures.length > 0 && <span className="import-problem-open">{open ? "Hide boxes" : "Show boxes"}</span>}
      </UnstyledButton>
      {open && (
        <ul className="import-captures">
          {captures.map((capture) => (
            <CaptureFix
              key={capture.player + capture.photo + capture.box_id}
              capture={capture}
              cube={cube}
              draftId={draftId}
              cards={cards}
              missingNames={missingNames}
              onFixed={onFixed}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
