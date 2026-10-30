import React from "react"
import { HoverStats } from "../components/kit/HoverStats.js"
import { StatTile } from "../components/kit/StatTile.js"
import { confidencePercent, winRateRows, winRateText } from "../components/kit/winRate.js"
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
// row is the player's entry from the server's player stats, and confidence
// labels the interval in the win rate's hover.
export function PlayerSummaryCard({ row, playerId, editable, onRenamed, confidence, copy }) {
  return (
    <>
      <section className="kit-card deck-identity">
        <div className="deck-identity-main">
          <PlayerRename player={{ id: playerId, name: row.name }} editable={editable} onRenamed={onRenamed} copy={copy} />
        </div>
        <div className="deck-identity-record">
          <HoverStats title="Bayes win %" rows={winRateRows(row, confidencePercent(confidence))}>
            <div className="deck-record">
              {winRateText(row)}
              <small>{copy.games} {row.wins}-{row.losses}</small>
            </div>
          </HoverStats>
        </div>
      </section>

      <div className="player-stat-tiles">
        <StatTile label={copy.decks} value={row.num_decks} />
        <StatTile label={copy.gamesTile} value={row.games} />
        <StatTile label={copy.trophies} value={row.trophies} />
        <StatTile label={copy.lastPlace} value={row.last_place} />
        <StatTile label={copy.opponentWinPercent} value={percent(row.opponent_win_percentage)} tip={copy.opponentStrengthTip} />
      </div>
    </>
  )
}
