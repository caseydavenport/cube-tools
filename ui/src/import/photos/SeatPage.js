import React, { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Group, Text } from "@mantine/core"
import { useCube } from "../../contexts/CubeContext.js"
import { EmptyState } from "../../components/kit/EmptyState.js"
import { PlayerPicker } from "../../components/PlayerPicker.js"
import { draftLabel } from "../../utils/DraftInfo.js"
import { SaveDeckRecord } from "../../utils/Fetch.js"
import { HUB_CRUMB, ImportToolbar } from "../ImportToolbar.js"
import { errorText } from "../useAction.js"
import { seatLabel, usePhotoDraft, usePlayers } from "./DraftReviewPage.js"
import { SeatWorkspace } from "./SeatWorkspace.js"
import "../import.css"

// SeatPage is one seat of a photo draft: pick the seat's player, then check
// the cards read off its photos and write its deck. Confirming returns to the
// draft.
export default function SeatPage() {
  const cube = useCube()
  const navigate = useNavigate()
  const { draftId, seatId } = useParams()
  const { draft, error, reload } = usePhotoDraft(cube, draftId)
  const [players, setPlayers] = usePlayers()
  const [assignError, setAssignError] = useState("")

  const seat = draft ? draft.players.find((s) => s.id === seatId) : null

  // assignPlayer points the seat's deck (deck N for seat pN) at a player, or
  // back to an anonymous seat for 0.
  async function assignPlayer(playerId) {
    setAssignError("")
    try {
      await SaveDeckRecord(cube, { draft_id: Number(draftId), id: Number(seatId.slice(1)), player_id: playerId })
      await reload()
    } catch (e) {
      setAssignError(errorText(e))
    }
  }

  const trail = [HUB_CRUMB]
  let title = seatId
  if (draft) {
    trail.push({ label: draftLabel(draft.draft), path: `review/${draftId}` })
  }
  if (seat) {
    title = seatLabel(seat, players)
  }

  let actions = null
  if (seat) {
    actions = (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed">Player</Text>
        <PlayerPicker
          players={players}
          value={seat.player_id || 0}
          takenIds={draft.players.filter((s) => s.id !== seat.id && s.player_id).map((s) => s.player_id)}
          onAdded={(player) => setPlayers((current) => [...current, player])}
          onChange={assignPlayer}
        />
        {assignError && <Text size="sm" c="red">{assignError}</Text>}
      </Group>
    )
  }

  let body
  if (error) {
    body = <EmptyState>Couldn't load this draft: {error}</EmptyState>
  } else if (!draft) {
    body = <EmptyState>Loading…</EmptyState>
  } else if (!seat) {
    body = <EmptyState>This draft has no seat {seatId}.</EmptyState>
  } else {
    body = (
      <SeatWorkspace
        key={seat.id}
        cube={cube}
        draft={draft}
        seat={seat}
        onConfirmed={() => navigate(`/${cube}/import/review/${draftId}`)}
      />
    )
  }

  return (
    <>
      <ImportToolbar trail={trail} title={title} actions={actions} />
      <div className="import-page wide">{body}</div>
    </>
  )
}
