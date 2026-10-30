import React from "react"
import { Checkbox, SegmentedControl, Text, UnstyledButton } from "@mantine/core"
import { EmptyState } from "../components/kit/EmptyState.js"
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

// ARCHETYPE_CHOICES are the quick filter's archetype options; "" is any.
const ARCHETYPE_CHOICES = [
  { label: "Any", value: "" },
  { label: "Aggro", value: "aggro" },
  { label: "Midrange", value: "midrange" },
  { label: "Control", value: "control" },
]

// MANA_COLORS are the colors the quick filter can require, in WUBRG order.
const MANA_COLORS = ["W", "U", "B", "R", "G"]

// QuickFilters are the controls above the deck list: an archetype, colors the
// deck must include, and whether to hide anonymous seats.
function QuickFilters({ page }) {
  const quick = page.quick

  // toggleColor adds the color to the chosen ones, or removes it if chosen.
  function toggleColor(color) {
    let colors = [...quick.colors, color]
    if (quick.colors.includes(color)) {
      colors = quick.colors.filter(c => c !== color)
    }
    page.setQuick({ ...quick, colors })
  }

  return (
    <div className="deck-quick-filters">
      <SegmentedControl
        size="xs"
        aria-label="Archetype"
        data={ARCHETYPE_CHOICES}
        value={quick.archetype}
        onChange={archetype => page.setQuick({ ...quick, archetype })}
      />
      <span className="deck-quick-colors">
        {MANA_COLORS.map(color => {
          const on = quick.colors.includes(color)
          return (
            <UnstyledButton
              key={color}
              className={"deck-quick-mana" + (on ? " deck-quick-mana-on" : "")}
              aria-pressed={on}
              aria-label={`Include ${color}`}
              onClick={() => toggleColor(color)}
            >
              {ColorImages([color])}
            </UnstyledButton>
          )
        })}
      </span>
      <Checkbox
        size="xs"
        label="Hide anonymous seats"
        checked={quick.hideAnonymous}
        onChange={event => page.setQuick({ ...quick, hideAnonymous: event.currentTarget.checked })}
      />
    </div>
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
      <QuickFilters page={page} />
      <Text className="deck-list-summary">{summaryText(decks, filtered, copy)}</Text>
      {decks.length === 0 && <EmptyState>No decks match these filters.</EmptyState>}

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
