import React from "react"
import { Text } from "@mantine/core"
import { Losses, MatchDraws, MatchLosses, MatchWins, Wins } from "../utils/Deck.js"
import { PlayerEdit } from "./edits/PlayerEdit.js"
import { ColorsEdit } from "./edits/ColorsEdit.js"
import { ArchetypeEdit } from "./edits/ArchetypeEdit.js"
import { TagsEdit } from "./edits/TagsEdit.js"
import { RecordEdit } from "./edits/RecordEdit.js"
import { Link } from "react-router-dom"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { packagePageHref } from "../shell/paths.js"

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

// IdentityRow is one labeled row under the deck's name: a label, with a tip
// explaining it, and the row's chips.
function IdentityRow({ label, tip, children }) {
  return (
    <>
      <HoverInfo title={label} info={tip}>
        <span className="deck-identity-label">{label}</span>
      </HoverInfo>
      <div className="deck-chip-list">{children}</div>
    </>
  )
}

// RuleChip is one community or package: its color, its name and, for a
// community, how many cards it holds. Hovering a community names its cards.
function RuleChip({ color, name, size, members, href }) {
  let text = <>{name}</>
  if (href) {
    text = <Link to={href} className="deck-chip-link">{name}</Link>
  }
  const chip = (
    <span className="deck-chip">
      <span className="dm-swatch" style={{ background: color }} />
      {text}
      {size !== undefined && <span className="deck-chip-size">{size}</span>}
    </span>
  )
  if (!members) {
    return chip
  }
  return <HoverInfo title={`${name}: ${size} cards`} info={members.join(", ")}>{chip}</HoverInfo>
}

const TAGS_TIP = "Your own labels for this deck."
const COMMUNITIES_TIP = "How this deck's cards cluster: groups of cards that link most to each other, named after the package they lean on most. The Map view draws them."
const PACKAGES_TIP = "Which of the rules' synergies this deck has enough cards to count as built. A deck can build a package whose cards are spread across several communities."

// IdentityCard is the top card of a deck's details: who played it, its colors
// and archetype, which draft it came from, its tags, communities and built
// packages, and its record. On writable cubes each of those but the communities has a pencil to
// edit it in place.
export function IdentityCard({ cube, deck, edits, tagSuggestions, communities, packages, copy }) {
  const showTags = edits.editable || (deck.labels || []).length > 0
  return (
    <section className="kit-card deck-identity">
      <div className="deck-identity-main">
        <div className="deck-identity-name">
          <PlayerEdit cube={cube} deck={deck} edits={edits} copy={copy} />
          <ColorsEdit deck={deck} edits={edits} copy={copy} />
          <ArchetypeEdit deck={deck} edits={edits} copy={copy} />
        </div>
        <Text className="deck-muted">{draftLine(deck, copy)}</Text>
        <div className="deck-identity-rows">
          {showTags && (
            <IdentityRow label="Tags" tip={TAGS_TIP}>
              <TagsEdit deck={deck} edits={edits} suggestions={tagSuggestions} copy={copy} />
            </IdentityRow>
          )}
          {communities.length > 0 && (
            <IdentityRow label="Communities" tip={COMMUNITIES_TIP}>
              {communities.map((c, i) => (
                <RuleChip key={i} color={c.color} name={c.label} size={c.size} members={c.members} />
              ))}
            </IdentityRow>
          )}
          {packages.length > 0 && (
            <IdentityRow label="Packages" tip={PACKAGES_TIP}>
              {packages.map(p => (
                <RuleChip key={p.name} color={p.color} name={p.name} href={packagePageHref(cube, p.name)} />
              ))}
            </IdentityRow>
          )}
        </div>
      </div>

      <RecordEdit cube={cube} deck={deck} edits={edits} copy={copy}>
        <RecordSummary deck={deck} copy={copy} />
      </RecordEdit>
    </section>
  )
}
