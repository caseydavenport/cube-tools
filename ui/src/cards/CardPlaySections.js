// The card page's play sections: who plays the card, the cards that fill the
// same role, the decks that played it, and its picks.

import React, { useState } from "react"
import { Link } from "react-router-dom"
import { UnstyledButton } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { archetypeLabel } from "../decks/deckModel.js"
import { deckHrefWithMatch, pageHrefWithMatch } from "../shell/paths.js"
import { ColorImages } from "../utils/Colors.js"
import { hasData } from "../utils/dataKinds.js"
import { deckRecord, notInCubeTag, pickLine, whoPlaysMatch } from "./cardPageModel.js"

// DECKS_SHOWN is how many decks the decks section lists before "Show all".
const DECKS_SHOWN = 10

// TraitChip is one who-plays-it chip: a label and count, linking to the
// decks that played the card with that trait.
function TraitChip({ label, count, match, nav }) {
  return (
    <Link
      className="kit-chip kit-chip-neutral"
      to={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
      onClick={() => nav.onMatch(match)}
    >
      {label}
      <span className="kit-chip-count">{count}</span>
    </Link>
  )
}

// TraitRow is one labeled row of trait chips, hidden when it has none.
function TraitRow({ title, entries, chipFor }) {
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="card-trait-row">
      <span className="card-trait-title">{title}</span>
      <div className="kit-chips">{entries.map(chipFor)}</div>
    </div>
  )
}

// WhoPlaysIt shows the colors, archetypes and players of the decks that
// played the card. info says which kinds of data the cube records.
export function WhoPlaysIt({ page, info, nav }) {
  const card = page.card.name
  if (page.deck_colors.length === 0) {
    return null
  }

  let archetypes = []
  if (hasData(info, "archetypes")) {
    archetypes = page.archetypes
  }

  return (
    <SectionCard title="Who plays it">
      <TraitRow title="Colors" entries={page.deck_colors} chipFor={e => (
        <TraitChip key={e.name} label={ColorImages(e.name.split(""))} count={e.count} match={whoPlaysMatch(card, "colors", e.name)} nav={nav} />
      )} />
      <TraitRow title="Archetypes" entries={archetypes} chipFor={e => (
        <TraitChip key={e.name} label={archetypeLabel({ macro_archetype: e.name }) || e.name} count={e.count} match={whoPlaysMatch(card, "archetype", e.name)} nav={nav} />
      )} />
      <TraitRow title="Players" entries={page.players} chipFor={e => (
        <TraitChip key={e.name} label={e.name} count={e.count} match={whoPlaysMatch(card, "player", e.name)} nav={nav} />
      )} />
    </SectionCard>
  )
}

// SameRole lists the cube cards that share the card's rarer groups and tags.
// For a card never in the cube, they're the cards it might replace.
export function SameRole({ page, cube }) {
  if (page.same_role.length === 0) {
    return null
  }
  let label = "Same role"
  if (!page.in_cube && notInCubeTag(page.history) === "Not in the cube") {
    label = "Cards it might replace"
  }
  const title = (
    <HoverInfo title={label} info="Cube cards sharing its rarer groups and Scryfall tags.">
      <span>{label}</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      <div className="kit-chips">
        {page.same_role.map(name => <CardLink key={name} cube={cube} name={name} className="kit-chip kit-chip-card" />)}
      </div>
    </SectionCard>
  )
}

// DeckRow is one deck, linking to it on the Decks page with the deck filter
// set to match, so the page highlights why the deck is listed.
export function DeckRow({ deck, match, nav }) {
  return (
    <Link
      className="card-deck-row"
      to={deckHrefWithMatch(nav.cube, deck.ref, match, nav.start, nav.end)}
      onClick={() => nav.onMatch(match)}
    >
      <span className="card-deck-date">{deck.date}</span>
      <span className="card-deck-player">{deck.player}</span>
      <span>{ColorImages(deck.colors.split(""))}</span>
      <span className="card-deck-arch">{archetypeLabel({ macro_archetype: deck.archetype }) || ""}</span>
      <span className="card-deck-record">{deckRecord(deck)}</span>
    </Link>
  )
}

// DecksPlayed lists the decks that played the card, newest first, showing
// DECKS_SHOWN until expanded.
export function DecksPlayed({ page, nav }) {
  const [expanded, setExpanded] = useState(false)
  if (page.decks.length === 0) {
    return null
  }
  let shown = page.decks
  if (!expanded) {
    shown = page.decks.slice(0, DECKS_SHOWN)
  }

  const match = `card:"${page.card.name}"`
  return (
    <SectionCard
      title="Decks that played it"
      linkLabel="All on the Decks page →"
      href={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
      onLinkClick={() => nav.onMatch(match)}
    >
      {shown.map(deck => <DeckRow key={deck.ref} deck={deck} match={match} nav={nav} />)}
      {!expanded && page.decks.length > DECKS_SHOWN && (
        <UnstyledButton className="card-partner-more" onClick={() => setExpanded(true)}>
          Show all {page.decks.length}
        </UnstyledButton>
      )}
    </SectionCard>
  )
}

// PickHistory lists the card's picks from drafts with pick logs.
export function PickHistory({ page }) {
  if (page.picks.length === 0) {
    return null
  }
  const draftCount = new Set(page.picks.map(p => p.draft_id)).size
  return (
    <SectionCard title="Pick history">
      <span className="card-trait-title">Picked in {draftCount} {draftCount === 1 ? "draft" : "drafts"} with logs</span>
      {page.picks.map((pick, i) => <div key={i} className="card-pick-line">{pickLine(pick)}</div>)}
    </SectionCard>
  )
}
