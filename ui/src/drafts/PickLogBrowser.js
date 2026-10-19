import React, { useState } from "react"
import { Group, Select } from "@mantine/core"
import { DraftPackWidget } from "../pages/Drafts.js"

// drafters lists the human players in a pick log, skipping bots.
function drafters(log) {
  return Object.values(log.users || {}).filter(user => !user.isBot)
}

// PickLogBrowser steps through a draft's pick log: choose a player and a pick
// number to see the pack they picked from, with their pick highlighted.
export function PickLogBrowser({ log, copy }) {
  const players = drafters(log)
  const [playerName, setPlayerName] = useState(null)
  const [pick, setPick] = useState("1")

  const player = players.find(user => user.userName === playerName)
  let pickCount = 0
  if (player) {
    pickCount = player.picks.length
  }

  const pickOptions = []
  for (let i = 1; i <= pickCount; i++) {
    pickOptions.push(String(i))
  }

  // choosePlayer switches player and starts again from their first pick.
  function choosePlayer(name) {
    setPlayerName(name)
    setPick("1")
  }

  return (
    <>
      <Group gap="sm" mb="sm">
        <Select
          size="xs"
          w={200}
          label={copy.player}
          placeholder={copy.choosePlayer}
          data={players.map(user => user.userName)}
          value={playerName}
          onChange={choosePlayer}
        />
        <Select
          size="xs"
          w={100}
          label={copy.pick}
          data={pickOptions}
          value={pick}
          onChange={value => setPick(value || "1")}
          disabled={!player}
          allowDeselect={false}
        />
      </Group>

      {/* DraftPackWidget reads a map of logs and picks one out by draft id. */}
      <DraftPackWidget
        drafts={{ selected: log }}
        selectedDraftLog={log.draft.id}
        selectedPlayer={playerName}
        selectedPack={Number(pick)}
      />
    </>
  )
}
