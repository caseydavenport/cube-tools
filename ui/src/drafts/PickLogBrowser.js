import React, { useState } from "react"
import { ActionIcon, Group, NumberInput, Select, Text } from "@mantine/core"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { DraftPackWidget } from "../pages/Drafts.js"
import { stepPick } from "./draftList.js"

// drafters lists the human players in a pick log, skipping bots.
function drafters(log) {
  return Object.values(log.users || {}).filter(user => !user.isBot)
}

// PickStepper chooses the pick number: previous and next buttons around a
// number box, then the player's pick count. A drafter makes 45 picks in a
// three-pack draft, too many to scan in a dropdown.
function PickStepper({ pick, pickCount, setPick, disabled, copy }) {
  // onType keeps a typed pick in range. Clearing the box leaves the pick as is.
  function onType(value) {
    if (typeof value === "number") {
      setPick(stepPick(value, 0, pickCount))
    }
  }

  return (
    <Group gap={4} align="flex-end">
      <ActionIcon
        variant="default"
        size="input-xs"
        aria-label={copy.previousPick}
        disabled={disabled || pick <= 1}
        onClick={() => setPick(stepPick(pick, -1, pickCount))}
      >
        <IconChevronLeft size={14} />
      </ActionIcon>
      <NumberInput
        size="xs"
        w={64}
        label={copy.pick}
        min={1}
        max={pickCount}
        hideControls
        value={pick}
        onChange={onType}
        disabled={disabled}
      />
      <ActionIcon
        variant="default"
        size="input-xs"
        aria-label={copy.nextPick}
        disabled={disabled || pick >= pickCount}
        onClick={() => setPick(stepPick(pick, 1, pickCount))}
      >
        <IconChevronRight size={14} />
      </ActionIcon>
      <Text size="xs" c="dimmed" pb={6}>
        {copy.pickOf} {pickCount}
      </Text>
    </Group>
  )
}

// PickLogBrowser steps through a draft's pick log: choose a player and a pick
// number to see the pack they picked from, with their pick highlighted.
export function PickLogBrowser({ log, copy }) {
  const players = drafters(log)
  const [playerName, setPlayerName] = useState(null)
  const [pick, setPick] = useState(1)

  const player = players.find(user => user.userName === playerName)
  let pickCount = 0
  if (player) {
    pickCount = player.picks.length
  }

  // choosePlayer switches player and starts again from their first pick.
  function choosePlayer(name) {
    setPlayerName(name)
    setPick(1)
  }

  return (
    <>
      <Group gap="sm" mb="sm" align="flex-end">
        <Select
          size="xs"
          w={200}
          label={copy.player}
          placeholder={copy.choosePlayer}
          data={players.map(user => user.userName)}
          value={playerName}
          onChange={choosePlayer}
        />
        <PickStepper pick={pick} pickCount={pickCount} setPick={setPick} disabled={!player} copy={copy} />
      </Group>

      {/* DraftPackWidget reads a map of logs and picks one out by draft id. */}
      <DraftPackWidget
        drafts={{ selected: log }}
        selectedDraftLog={log.draft.id}
        selectedPlayer={playerName}
        selectedPack={pick}
      />
    </>
  )
}
