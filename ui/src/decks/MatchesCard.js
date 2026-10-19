import React from "react"
import { Link } from "react-router-dom"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { matchRows } from "./deckModel.js"

const RESULT_CLASSES = { W: "deck-win", L: "deck-loss", D: "deck-draw" }

// OpponentName links to the opponent's deck when it's in the list, and is
// plain text otherwise.
function OpponentName({ row, hrefFor, copy }) {
  const name = row.opponent || copy.unknownOpponent
  if (row.opponentRef) {
    return <Link to={hrefFor(row.opponentRef)} className="deck-opponent">{name}</Link>
  }
  return <span>{name}</span>
}

// MatchRow is one match: the round, the opponent and their archetype, and the
// result and game score.
function MatchRow({ row, hrefFor, copy }) {
  return (
    <div className="deck-match">
      <span>
        {row.round && <span className="deck-muted deck-round">R{row.round}</span>}
        {copy.versus} <OpponentName row={row} hrefFor={hrefFor} copy={copy} />
        {row.opponentArchetype && <span className="deck-muted"> {row.opponentArchetype}</span>}
      </span>
      <span className={RESULT_CLASSES[row.result]}>{row.result} {row.score}</span>
    </div>
  )
}

// MatchesCard lists the deck's matches in round order. decks is the loaded
// list, used to find and link each opponent's deck.
export function MatchesCard({ deck, decks, hrefFor, copy }) {
  const rows = matchRows(deck, decks)

  return (
    <SectionCard title={copy.matches}>
      {rows.length === 0 && <EmptyState>{copy.noMatches}</EmptyState>}
      {rows.map((row, i) => <MatchRow key={i} row={row} hrefFor={hrefFor} copy={copy} />)}
    </SectionCard>
  )
}
