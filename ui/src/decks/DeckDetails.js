import React from "react"
import { CloseButton } from "@mantine/core"
import { EmptyState } from "../components/kit/EmptyState.js"
import { deckRef, resolveSelectedDeck } from "./deckModel.js"
import { useDeckEdits } from "./useDeckEdits.js"
import { IdentityCard } from "./IdentityCard.js"
import { DeckStatTiles } from "./DeckStatTiles.js"
import { ManaThemesCard } from "./ManaThemesCard.js"
import { MatchesCard } from "./MatchesCard.js"
import { DecklistCard } from "./DecklistCard.js"
import { NotesCard } from "./NotesCard.js"
import { CompareView } from "./CompareView.js"

// SaveError is the one line under the identity card that reports a failed
// save, whichever field it was, with a button to dismiss it.
function SaveError({ edits, copy }) {
  if (!edits.error) {
    return null
  }

  return (
    <div className="deck-save-error" role="alert">
      <span>{edits.error}</span>
      <CloseButton size="sm" aria-label={copy.dismiss} onClick={edits.clearError} />
    </div>
  )
}

// SelectedDeck lays out one deck's details, top to bottom: who and what, the
// numbers, mana and themes beside the matches, the cards, then the notes.
function SelectedDeck({ deck, page, copy }) {
  const edits = useDeckEdits(page.cube, deck, page.onDecksUpdated)

  return (
    <div className="deck-details">
      <IdentityCard cube={page.cube} deck={deck} edits={edits} tagSuggestions={page.archetypes} copy={copy} />
      <SaveError edits={edits} copy={copy} />
      <DeckStatTiles deck={deck} copy={copy} />

      <div className="deck-details-pair">
        <ManaThemesCard deck={deck} groupDistributions={page.groupDistributions} copy={copy} />
        <MatchesCard deck={deck} decks={page.decks} hrefFor={page.selection.hrefFor} copy={copy} />
      </div>

      <DecklistCard deck={deck} page={page} copy={copy} />
      <NotesCard deck={deck} edits={edits} copy={copy} />
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
  // The key gives each deck its own copy of SelectedDeck, so an open editor or
  // an error message doesn't carry over when the selection moves on.
  return <SelectedDeck key={deckRef(selected.deck)} deck={selected.deck} page={page} copy={copy} />
}
