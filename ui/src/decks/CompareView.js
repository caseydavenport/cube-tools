import React from "react"
import { Button } from "@mantine/core"
import { SectionCard } from "../components/kit/SectionCard.js"
import { EmptyState } from "../components/kit/EmptyState.js"
import { boardCards } from "./deckModel.js"
import { TextDecklist } from "./TextDecklist.js"
import { DecklistToggles } from "./DecklistCard.js"

// sharedCards returns the cards that every compared deck has on the board, one
// copy each, in the first deck's order.
function sharedCards(decks, board) {
  const lists = decks.map(deck => new Set(boardCards(deck, board).map(c => c.name)))
  const seen = new Set()
  const shared = []

  for (const card of boardCards(decks[0], board)) {
    const inEvery = lists.every(names => names.has(card.name))
    if (inEvery && !seen.has(card.name)) {
      seen.add(card.name)
      shared.push(card)
    }
  }
  return shared
}

// CompareView takes over the details pane while two or more decks are
// compared. It lists the players and shows only the cards all of them played.
export function CompareView({ comparison, page, copy }) {
  const decks = [...comparison.values()]
  const cards = sharedCards(decks, page.board)
  const players = decks.map(deck => deck.player).join(", ")

  return (
    <div className="deck-details">
      <section className="kit-card deck-identity">
        <div className="deck-identity-main">
          <h2 className="deck-player">{copy.comparing} {decks.length} {copy.decksLower}</h2>
          <span className="deck-muted">{players}</span>
        </div>
        <Button variant="default" size="xs" onClick={page.selection.clearCompare}>
          {copy.clearCompare}
        </Button>
      </section>

      <SectionCard title={copy.sharedCards}>
        <DecklistToggles board={page.board} onBoardChange={page.setBoard} copy={copy} />
        {cards.length === 0 && <EmptyState>{copy.noSharedCards}</EmptyState>}
        {cards.length > 0 && <TextDecklist deck={null} cards={cards} sideboard={false} matchStr={page.filter.settled} synergy={null} />}
      </SectionCard>
    </div>
  )
}
