import React from "react"
import { Text } from "@mantine/core"
import { ListGroupHeader, ListRow } from "../components/kit/ListDetail.js"
import { ColorImages } from "../utils/Colors.js"
import { MatchDraws, MatchLosses, MatchWins } from "../utils/Deck.js"
import { deckRef, groupByDraft, listSummary } from "./deckModel.js"

// rowRecord is the match record shown at the right of a deck's row, or the
// placeholder for a deck with no matches.
function rowRecord(deck, copy) {
  const wins = MatchWins(deck)
  const losses = MatchLosses(deck)
  const draws = MatchDraws(deck)
  if (wins + losses + draws === 0) {
    return copy.noRecord
  }
  return `${wins}-${losses}-${draws}`
}

// summaryText is the line above the list: how many decks it holds, and when a
// filter is on, their combined record.
function summaryText(decks, filtered, copy) {
  const summary = listSummary(decks)
  let text = `${summary.count} ${copy.decksLower}`
  if (filtered) {
    text += ` · ${summary.wins}-${summary.losses}-${summary.draws} (${summary.winPercent}%)`
  }
  return text
}

// DeckRow is one deck in the list: the player and their colors, and the record.
// A plain click follows the row's link to the deck. Ctrl or Cmd+click, or any
// click in compare mode, adds the deck to the comparison instead.
function DeckRow({ deck, page, compareMode, copy }) {
  const ref = deckRef(deck)
  const selected = ref === page.selection.selectedRef || page.comparison.has(ref)

  function onClick(event) {
    if (compareMode || event.ctrlKey || event.metaKey) {
      // Stop the link from navigating, so the click only changes the comparison.
      event.preventDefault()
      page.selection.toggleCompare(ref)
    }
  }

  const primary = (
    <span className="deck-row-name">
      {deck.player}
      <span className="deck-row-mana">{ColorImages(deck.colors)}</span>
    </span>
  )

  return (
    <ListRow
      href={page.selection.hrefFor(ref)}
      onClick={onClick}
      selected={selected}
      primary={primary}
      secondary={rowRecord(deck, copy)}
    />
  )
}

// DeckListPane is the left pane of the Decks page. Sorted by date, the decks are
// grouped under a header per draft; other sorts show one flat list, since a
// header per row would be noise.
export function DeckListPane({ page, compareMode, copy }) {
  const decks = page.sortedDecks
  const filtered = page.filter.settled !== ""

  let groups = [{ draft: "all", label: null, decks }]
  if (page.sort === "date") {
    groups = groupByDraft(decks)
  }

  return (
    <>
      <Text className="deck-list-summary">{summaryText(decks, filtered, copy)}</Text>

      {groups.map(group => (
        <React.Fragment key={group.draft}>
          {group.label && <ListGroupHeader>{group.label}</ListGroupHeader>}
          {group.decks.map(deck => (
            <DeckRow key={deckRef(deck)} deck={deck} page={page} compareMode={compareMode} copy={copy} />
          ))}
        </React.Fragment>
      ))}
    </>
  )
}
