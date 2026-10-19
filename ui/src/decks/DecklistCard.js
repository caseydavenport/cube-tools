import React from "react"
import { SegmentedControl } from "@mantine/core"
import { boardCards } from "./deckModel.js"
import { TextDecklist } from "./TextDecklist.js"
import { ImageDecklist } from "./ImageDecklist.js"
import { MapDecklist } from "./MapDecklist.js"

// DecklistToggles are the board (mainboard, sideboard, pool) and view (text,
// images, map) switches in the card's header. Without onViewChange only the
// board switch shows, as in the compare view, which is text only.
export function DecklistToggles({ board, onBoardChange, view, onViewChange, copy }) {
  let viewToggle = null
  if (onViewChange) {
    viewToggle = (
      <SegmentedControl
        size="xs"
        value={view}
        onChange={onViewChange}
        data={[
          { label: copy.text, value: "Text" },
          { label: copy.images, value: "Images" },
          { label: copy.map, value: "Map" },
        ]}
      />
    )
  }

  return (
    <div className="deck-toggles">
      <SegmentedControl
        size="xs"
        value={board}
        onChange={onBoardChange}
        data={[
          { label: copy.mainboard, value: "Mainboard" },
          { label: copy.sideboard, value: "Sideboard" },
          { label: copy.pool, value: "Pool" },
        ]}
      />
      {viewToggle}
    </div>
  )
}

// DecklistBody renders the chosen board in the chosen view.
function DecklistBody({ deck, cards, board, view, matchStr, synergy, designGraph }) {
  const sideboard = board === "Sideboard"

  if (view === "Images") {
    return <ImageDecklist deck={deck} cards={cards} sideboard={sideboard} matchStr={matchStr} />
  }
  if (view === "Map") {
    return <MapDecklist cards={cards} designGraph={designGraph} />
  }
  return <TextDecklist deck={deck} cards={cards} sideboard={sideboard} matchStr={matchStr} synergy={synergy} />
}

// DecklistCard shows the deck's cards, with toggles for which board to show
// and how to show it.
export function DecklistCard({ deck, page, copy }) {
  const cards = boardCards(deck, page.board)

  return (
    <section className="kit-card kit-section">
      <div className="kit-section-header">
        <span className="kit-section-title">{copy.deck}</span>
        <DecklistToggles
          board={page.board}
          onBoardChange={page.setBoard}
          view={page.view}
          onViewChange={page.setView}
          copy={copy}
        />
      </div>

      <DecklistBody
        deck={deck}
        cards={cards}
        board={page.board}
        view={page.view}
        matchStr={page.filter.settled}
        synergy={page.synergy}
        designGraph={page.designGraph}
      />
    </section>
  )
}
