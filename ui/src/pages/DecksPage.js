import React, { useState } from "react"
import { useCube } from "../contexts/CubeContext.js"
import { useArrowNav } from "../hooks/useArrowNav.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { ListDetail } from "../components/kit/ListDetail.js"
import { PageToolbar } from "../toolbar/PageToolbar.js"
import { DateRangeMenu } from "../toolbar/DateRangeMenu.js"
import { deckRef } from "../decks/deckModel.js"
import { useDecksPage } from "../decks/useDecksPage.js"
import { DeckListPane } from "../decks/DeckListPane.js"
import { DeckDetails } from "../decks/DeckDetails.js"
import { DeckActions } from "../decks/DeckActions.js"
import "../decks/decks.css"

// COPY holds every piece of text on the Decks page. These are placeholders for
// Casey to replace.
const COPY = {
  title: "Decks",
  filterPlaceholder: "Filter decks",

  allTime: "All time",
  last12Months: "Last 12 months",
  customRange: "Custom range",
  from: "From",
  to: "To",
  apply: "Apply",

  copyList: "Copy list",
  copied: "Copied",
  compare: "Compare",
  previous: "Previous deck",
  next: "Next deck",
  settings: "List settings",
  sort: "Sort by",
  sortDate: "Date",
  sortPlayer: "Player",
  sortRecord: "Record",
  sortArchetype: "Archetype",

  decksLower: "decks",
  noRecord: "no matches",
  pickDeck: "Pick a deck from the list",
  deckNotInList: "That deck isn't in the current list",

  seat: "seat",
  games: "games",
  winRate: "win rate",

  cards: "Cards",
  creatures: "Creatures",
  interaction: "Interaction",
  avgManaValue: "Avg mana value",
  opponentWinPercent: "Opponent win %",

  manaSymbols: "Mana symbols",
  leansInto: "Leans into",
  top: "top",
  cardsLower: "cards",

  matches: "Matches",
  noMatches: "No matches recorded",
  versus: "vs",
  unknownOpponent: "Unknown",

  deck: "Deck",
  mainboard: "Mainboard",
  sideboard: "Sideboard",
  pool: "Pool",
  text: "Text",
  images: "Images",
  map: "Map",

  notes: "Notes",

  comparing: "Comparing",
  clearCompare: "Clear comparison",
  sharedCards: "Cards in every deck",
  noSharedCards: "These decks share no cards",
}

// DecksPage is the deck browser: the toolbar with the date range, deck filter,
// and actions on top, the deck list on the left, and the selected deck (or a
// comparison) on the right. props carry the app-wide date range and filter.
export function DecksPage(props) {
  const cube = useCube()
  const page = useDecksPage(cube, props)

  // In compare mode a row click adds the deck to the comparison, the same as
  // Ctrl+click.
  const [compareMode, setCompareMode] = useState(false)

  // The left and right arrow keys step through the list.
  useArrowNav(page.sortedDecks, page.selection.selectedRef, deckRef, page.selection.select)

  const actions = (
    <DeckActions page={page} compareMode={compareMode} onToggleCompare={() => setCompareMode(!compareMode)} copy={COPY} />
  )

  return (
    <>
      <PageToolbar title={COPY.title} actions={actions}>
        <DateRangeMenu start={props.startDate} end={props.endDate} onChange={props.onRangeChange} copy={COPY} />
        <PillSearchInput
          placeholder={COPY.filterPlaceholder}
          value={page.filter.typed}
          cardNames={page.cardNames}
          playerNames={page.playerNames}
          archetypes={page.archetypes}
          eventCodes={page.eventCodes}
          onChange={event => page.filter.setTyped(event.target.value)}
        />
      </PageToolbar>

      <ListDetail
        list={<DeckListPane page={page} compareMode={compareMode} copy={COPY} />}
        detail={<DeckDetails page={page} copy={COPY} />}
      />
    </>
  )
}
