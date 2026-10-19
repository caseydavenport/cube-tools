import React from "react"
import { Text } from "@mantine/core"
import { ListRow } from "../components/kit/ListDetail.js"

// rowDetail is the muted text at the right of a player's row: their win rate
// and deck count.
function rowDetail(row, copy) {
  let decks = copy.decksLower
  if (row.num_decks === 1) {
    decks = copy.deckLower
  }
  return `${row.win_percent.toFixed(0)}% · ${row.num_decks} ${decks}`
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
