import React from "react"
import { Text } from "@mantine/core"
import { ListRow } from "../components/kit/ListDetail.js"
import { winRateText } from "../components/kit/winRate.js"

// MIN_GAMES_FOR_WIN_RATE is how many games a player needs before the list
// shows their win rate. Below it, a 0% or 100% from a handful of games reads
// like a real result.
const MIN_GAMES_FOR_WIN_RATE = 10

// rowDetail is the muted text at the right of a player's row: their Bayes win
// rate, once they have enough games, and their deck count.
function rowDetail(row, copy) {
  let decks = copy.decksLower
  if (row.num_decks === 1) {
    decks = copy.deckLower
  }
  const deckText = `${row.num_decks} ${decks}`
  if ((row.games || 0) < MIN_GAMES_FOR_WIN_RATE) {
    return deckText
  }
  return `${winRateText(row)} · ${deckText}`
}

// PlayerList is the left pane of the Players page: one row per player meeting
// the minimum games, in the chosen order. selectionFor gives the ?player=
// value for a row (an id, or the name for players outside the list).
export function PlayerList({ rows, selectedName, selectionFor, copy }) {
  return (
    <>
      <Text className="deck-list-summary">{rows.length} {copy.playersLower}</Text>
      {rows.map(row => (
        <ListRow
          key={row.name}
          href={`?player=${encodeURIComponent(selectionFor(row.name))}`}
          selected={row.name === selectedName}
          primary={row.name}
          secondary={rowDetail(row, copy)}
        />
      ))}
    </>
  )
}
