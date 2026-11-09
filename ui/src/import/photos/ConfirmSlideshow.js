import React, { useCallback, useEffect, useState } from "react"
import { ActionIcon, Button, Group, Text } from "@mantine/core"
import { IconCheck, IconX } from "@tabler/icons-react"
import { CardSearch } from "../CardSearch.js"
import { Snippet } from "./Snippet.js"

// ConfirmSlideshow steps through every named box one at a time, a large crop of
// the photo beside the name it was given, as a last check before the deck is
// written. Enter or → accepts and moves on, ↓ opens a fix (close guesses and a
// search) that renames the card and moves on, ← steps back, and Esc closes a
// fix. captures come from resolvedCaptures, each tagged with its group;
// onCorrect(capture, name) renames one.
export function ConfirmSlideshow({ captures, cards, cube, draftId, photoVersion, onCorrect }) {
  const [index, setIndex] = useState(0)
  const [fixing, setFixing] = useState(false)
  const total = captures.length
  const finished = index >= total

  // Start over when the number of captures changes, as after a rescan. A fix
  // keeps the count, so it doesn't reset the place.
  useEffect(() => {
    setIndex(0)
    setFixing(false)
  }, [total])

  const accept = useCallback(() => {
    setFixing(false)
    setIndex((i) => i + 1)
  }, [])

  const back = useCallback(() => {
    setFixing(false)
    setIndex((i) => Math.max(i - 1, 0))
  }, [])

  useEffect(() => {
    if (finished) {
      return undefined
    }

    function onKey(e) {
      // While the fix's search box has focus, it owns the keyboard.
      if (e.target.tagName === "INPUT") {
        return
      }
      if (fixing) {
        if (e.key === "Escape") {
          e.preventDefault()
          setFixing(false)
        }
        return
      }
      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault()
        accept()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        back()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setFixing(true)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [finished, fixing, accept, back])

  if (total === 0) {
    return null
  }

  if (finished) {
    return (
      <div className="import-slideshow">
        <Text c="dimmed">Checked all {total} cards.</Text>
        <Button variant="default" onClick={() => setIndex(0)}>Check again</Button>
      </div>
    )
  }

  const capture = captures[index]
  const guesses = (capture.candidates || []).filter((guess) => guess.name !== capture.chosen).slice(0, 3)

  // correct renames the shown card and moves on.
  function correct(name) {
    onCorrect(capture, name)
    setFixing(false)
    setIndex((i) => i + 1)
  }

  return (
    <div className="import-slideshow">
      <Text size="sm" c="dimmed">{index + 1} of {total} · {capture.group}</Text>
      <Snippet cube={cube} draftId={draftId} source={capture.source} photoVersion={photoVersion} width={620} height={150} />
      <Text className="import-slide-name">{capture.chosen}</Text>

      <Group gap="xl">
        <ActionIcon size={56} radius="xl" variant="light" color="green" onClick={accept} aria-label="Looks right (Enter)">
          <IconCheck size={28} />
        </ActionIcon>
        <ActionIcon size={56} radius="xl" variant="light" color="red" onClick={() => setFixing(true)} aria-label="Wrong, fix it (↓)">
          <IconX size={28} />
        </ActionIcon>
      </Group>

      {fixing && (
        <div className="import-slide-fix">
          {guesses.length > 0 && (
            <Group gap={4} justify="center">
              {guesses.map((guess) => (
                <Button key={guess.name} size="compact-xs" variant="default" onClick={() => correct(guess.name)}>
                  {guess.name}{guess.score != null ? ` (${guess.score.toFixed(2)})` : ""}
                </Button>
              ))}
            </Group>
          )}
          <CardSearch cards={cards} onPick={correct} placeholder="Name this card…" autoFocus />
        </div>
      )}
      {!fixing && <Text size="xs" c="dimmed">Enter accepts · ← back · ↓ fix</Text>}
    </div>
  )
}
