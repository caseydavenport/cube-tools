import React, { useMemo } from "react"
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
import { SimilarDecks } from "./SimilarDecks.js"
import { CompareView } from "./CompareView.js"
import { deckCommunities } from "../design/map/deckCommunities.js"
import { IsBasicLand } from "../utils/Utils.js"

// SaveError is the one line under the identity card that reports the last
// failed save, whichever field it was. A failure on another deck (the viewer
// moved on before it answered) names that deck's player.
function SaveError({ deck, page, copy }) {
  const error = page.saveError
  if (!error) {
    return null
  }

  let message = error.message
  if (error.ref !== deckRef(deck)) {
    message = `${error.player}: ${error.message}`
  }

  return (
    <div className="deck-save-error" role="alert">
      <span>{message}</span>
      <CloseButton size="sm" aria-label={copy.dismiss} onClick={page.clearSaveError} />
    </div>
  )
}

// useDeckCommunities is the deck's mainboard communities from the design
// graph, the same ones the Map view draws for the mainboard. It's empty while
// the graph loads.
function useDeckCommunities(deck, designGraph) {
  return useMemo(() => {
    const names = new Set()
    for (const card of deck.mainboard || []) {
      if (!IsBasicLand(card)) {
        names.add(card.name)
      }
    }
    const packageIndex = {}
    const packages = designGraph.packages || []
    for (let i = 0; i < packages.length; i++) {
      packageIndex[packages[i].name] = i
    }
    return deckCommunities([...names], designGraph.edges || [], packageIndex).list
  }, [deck, designGraph])
}

// SelectedDeck lays out one deck's details, top to bottom: who and what, the
// numbers, mana and themes beside the matches, the cards, the decks most like
// it, then the notes.
function SelectedDeck({ deck, page, copy }) {
  const edits = useDeckEdits(page.cube, deck, page)
  const communities = useDeckCommunities(deck, page.designGraph)

  return (
    <div className="deck-details">
      <IdentityCard cube={page.cube} deck={deck} edits={edits} tagSuggestions={page.archetypes} communities={communities} copy={copy} />
      <SaveError deck={deck} page={page} copy={copy} />
      <DeckStatTiles deck={deck} copy={copy} />

      <div className="deck-details-pair">
        <ManaThemesCard deck={deck} groupDistributions={page.groupDistributions} copy={copy} />
        <MatchesCard deck={deck} decks={page.decks} hrefFor={page.selection.hrefFor} copy={copy} />
      </div>

      <DecklistCard deck={deck} page={page} copy={copy} />
      <SimilarDecks cube={page.cube} deck={deck} decks={page.decks} hrefFor={page.selection.hrefFor} />
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

  // Until the first list arrives every ref would look missing, so wait.
  if (!page.loaded) {
    return <EmptyState>{copy.loading}</EmptyState>
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
