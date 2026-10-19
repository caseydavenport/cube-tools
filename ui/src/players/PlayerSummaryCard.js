import React from "react"
import { StatTile } from "../components/kit/StatTile.js"
import { PlayerRename } from "./PlayerRename.js"

// percent formats a number as a whole percentage, or a dash when it's unknown.
function percent(value) {
  if (value === null || value === undefined) {
    return "–"
  }
  return `${value.toFixed(0)}%`
}

// PlayerSummaryCard is the top of a player's details: their name (with rename
// on writable cubes) and game record, then a row of their headline numbers.
// row is the player's entry from the stats (PlayerData).
export function PlayerSummaryCard({ row, playerId, editable, onRenamed, copy }) {
  return (
    <>
      <section className="kit-card deck-identity">
        <div className="deck-identity-main">
          <PlayerRename player={{ id: playerId, name: row.name }} editable={editable} onRenamed={onRenamed} copy={copy} />
        </div>
        <div className="deck-identity-record">
          <div className="deck-record">
            {percent(row.win_percent)}
            <small>{copy.games} {row.wins}-{row.losses}</small>
          </div>
        </div>
      </section>

      <div className="player-stat-tiles">
        <StatTile label={copy.decks} value={row.num_decks} />
        <StatTile label={copy.gamesTile} value={row.games} />
        <StatTile label={copy.trophies} value={row.trophies} />
        <StatTile label={copy.lastPlace} value={row.last_place} />
        <StatTile label={copy.opponentWinPercent} value={percent(row.opponent_win_percentage)} />
        <StatTile label={copy.uniqueness} value={percent(row.uniqueness)} />
        <StatTile label={copy.avgWords} value={row.avg_word_count || 0} />
      </div>
    </>
  )
}
