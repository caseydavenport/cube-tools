import React from "react"
import { EmptyState } from "../components/kit/EmptyState.js"
import { resolveSelectedDeck } from "./deckModel.js"
import { IdentityCard } from "./IdentityCard.js"
import { DeckStatTiles } from "./DeckStatTiles.js"
import { ManaThemesCard } from "./ManaThemesCard.js"
import { MatchesCard } from "./MatchesCard.js"
import { DecklistCard } from "./DecklistCard.js"
import { NotesCard } from "./NotesCard.js"
import { CompareView } from "./CompareView.js"

// SelectedDeck lays out one deck's details, top to bottom: who and what, the
// numbers, mana and themes beside the matches, the cards, then the notes.
function SelectedDeck({ deck, page, copy }) {
  return (
    <div className="deck-details">
      <IdentityCard deck={deck} copy={copy} />
      <DeckStatTiles deck={deck} copy={copy} />

      <div className="deck-details-pair">
        <ManaThemesCard deck={deck} groupDistributions={page.groupDistributions} copy={copy} />
        <MatchesCard deck={deck} decks={page.decks} hrefFor={page.selection.hrefFor} copy={copy} />
      </div>

      <DecklistCard deck={deck} page={page} copy={copy} />
      <NotesCard deck={deck} copy={copy} />
    </div>
  )
}

// DeckDetails fills the details pane: the comparison when two or more decks
// are compared, otherwise the selected deck, or a prompt when there's none.
// A ?deck= link to a deck the current list doesn't hold says so, rather than
// leaving another deck on screen.
export function DeckDetails({ page, copy }) {
  if (page.comparison.size > 1) {
    return <CompareView comparison={page.comparison} page={page} copy={copy} />
  }

  const selected = resolveSelectedDeck(page.decks, page.selection.selectedRef)
  if (selected.status === "none") {
    return <EmptyState>{copy.pickDeck}</EmptyState>
  }
  if (selected.status === "missing") {
    return <EmptyState>{copy.deckNotInList}</EmptyState>
  }
  return <SelectedDeck deck={selected.deck} page={page} copy={copy} />
}
