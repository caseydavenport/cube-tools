import React from "react"
import { Text } from "@mantine/core"
import { Losses, MatchDraws, MatchLosses, MatchWins, Wins } from "../utils/Deck.js"
import { PlayerEdit } from "./edits/PlayerEdit.js"
import { ColorsEdit } from "./edits/ColorsEdit.js"
import { ArchetypeEdit } from "./edits/ArchetypeEdit.js"
import { TagsEdit } from "./edits/TagsEdit.js"
import { RecordEdit } from "./edits/RecordEdit.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"

// matchRecordText is a deck's match record as "W-L-D".
function matchRecordText(deck) {
  return `${MatchWins(deck)}-${MatchLosses(deck)}-${MatchDraws(deck)}`
}

// gameWinPercent is the share of games the deck won, rounded, or null with no
// games played.
function gameWinPercent(deck) {
  const games = Wins(deck) + Losses(deck)
  if (games === 0) {
    return null
  }
  return Math.round(100 * Wins(deck) / games)
}

// draftLine is the muted line under the player's name: the draft, its date,
// and the seat when the deck has one.
function draftLine(deck, copy) {
  const draft = deck.draft || {}
  const parts = [draft.event_name || `Draft #${deck.metadata.draft_id}`, deck.date]
  if (deck.seat) {
    parts.push(`${copy.seat} ${deck.seat}`)
  }
  return parts.join(" · ")
}

// RecordSummary is the right side of the identity card: the match record, the
// game record, and the win rate.
function RecordSummary({ deck, copy }) {
  const winPercent = gameWinPercent(deck)

  return (
    <div className="deck-identity-record">
      <div className="deck-record">
        {matchRecordText(deck)}
        <small>{copy.games} {Wins(deck)}-{Losses(deck)}</small>
      </div>
      {winPercent !== null && <Text className="deck-muted">{winPercent}% {copy.winRate}</Text>}
    </div>
  )
}

// Communities lists the deck's communities as chips, each with the color the
// Map view gives it, its package and its size. Hovering a chip names its cards.
function Communities({ communities }) {
  if (communities.length === 0) {
    return null
  }

  return (
    <div className="deck-communities">
      <HoverInfo
        title="Communities"
        info="Groups of this deck's cards that the design rules link more to each other than to the rest, named by the package with the most links inside them. The Map view draws them."
      >
        <span className="deck-communities-title">Communities</span>
      </HoverInfo>
      {communities.map((c, i) => (
        <HoverInfo key={i} title={`${c.label}: ${c.size} cards`} info={c.members.join(", ")}>
          <span className="deck-community">
            <span className="dm-swatch" style={{ background: c.color }} />
            {c.label}
            <span className="deck-community-size">{c.size}</span>
          </span>
        </HoverInfo>
      ))}
    </div>
  )
}

// IdentityCard is the top card of a deck's details: who played it, its colors
// and archetype, which draft it came from, its tags, its communities, and its
// record. On writable cubes each of those but the communities has a pencil to
// edit it in place.
export function IdentityCard({ cube, deck, edits, tagSuggestions, communities, copy }) {
  return (
    <section className="kit-card deck-identity">
      <div className="deck-identity-main">
        <div className="deck-identity-name">
          <PlayerEdit cube={cube} deck={deck} edits={edits} copy={copy} />
          <ColorsEdit deck={deck} edits={edits} copy={copy} />
          <ArchetypeEdit deck={deck} edits={edits} copy={copy} />
        </div>
        <Text className="deck-muted">{draftLine(deck, copy)}</Text>
        <TagsEdit deck={deck} edits={edits} suggestions={tagSuggestions} copy={copy} />
        <Communities communities={communities} />
      </div>

      <RecordEdit cube={cube} deck={deck} edits={edits} copy={copy}>
        <RecordSummary deck={deck} copy={copy} />
      </RecordEdit>
    </section>
  )
}
