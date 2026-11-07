// The Cards stats table with its view tabs, and the controls above it: the
// card search with its quick chips, and the popularity switch.

import React from 'react'
import { Chip, Group } from "@mantine/core"
import { ChoiceHeader } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { asEvent } from "../../components/kit/controls.js"
import { TabbedPanel } from "../../components/PageSections.js"
import { availableValue, visibleItems } from "../../utils/dataKinds.js"
import { PillSearchInput } from "../../components/PillSearchInput.js"
import { hasTerm, toggleTerm } from "../../search/searchTerms.js"
import { searchTagValues } from "../../utils/tagOptions.js"
import { CARDS_COPY } from "./copy.js"
import { POPULARITY_OPTIONS, POPULARITY_TIP, matchesPopularity } from "./cardFilters.js"
import { METADATA_COLUMNS, MIX_COLUMNS, OVERVIEW_COLUMNS, isNewCard, sortValue } from "./cardColumns.js"
import "../stats.css"

// QUICK_TERMS are one-click search terms for the common card roles. Each chip
// adds its term to the search, or takes it out again.
const QUICK_TERMS = [
  { label: "Removal", term: "is:removal" },
  { label: "Counterspells", term: "is:counterspell" },
  { label: "Interaction", term: "is:interaction" },
  { label: "Lands", term: "t:land" },
  { label: "Nonland", term: "-t:land" },
]

// cubeCobraTags are the cube owner's curated Cube Cobra tags, which the
// search offers as cctag: values. value is the tag as Cube Cobra spells it.
export const cubeCobraTags = [
  { label: "DNA", value: "🧬" },
  { label: "Watch", value: "watch" },
  { label: "Remove", value: "remove" },
]

// shouldSkip returns true if the card should be skipped, and false otherwise.
// The search runs on the server; until it answers, every card shows.
export function shouldSkip(card, input) {
  let players = Object.entries(card.players)
  if (players.length < input.minPlayers) {
    return true
  }
  if (input.maxPlayers != 0 && players.length > input.maxPlayers) {
    return true
  }
  if (input.manaValue >= 0 && card.cmc != input.manaValue) {
    return true
  }
  const matched = input.cardSearch && input.cardSearch.names
  if (matched && !matched.has(card.name)) {
    return true
  }
  return !matchesPopularity(card, input.popularityFilter)
}


// CARD_STATS_TYPES are the views of the card stats table. The archetype mix
// splits each card's decks by macro archetype, so it needs archetype labels.
const OverviewType = CARDS_COPY.statsTable.typeOverview
const MetadataType = CARDS_COPY.statsTable.typeMetadata
const ArchetypeMixType = CARDS_COPY.statsTable.typeArchetypeMix

const CARD_STATS_TYPES = [
  { label: OverviewType, value: OverviewType },
  { label: MetadataType, value: MetadataType },
  { label: ArchetypeMixType, value: ArchetypeMixType, needs: ["archetypes"] },
]

// isBlank reports whether a sort value is missing, so it can sink to the bottom.
function isBlank(value) {
  return value === undefined || value === null || (typeof value === "number" && Number.isNaN(value))
}

// sortCards orders cards by the chosen column, descending unless sortInvert is
// set. New cards (too few drafts to judge) and blank values always sink to the
// bottom, whichever way the column is sorted.
function sortCards(cards, input) {
  const dir = input.sortInvert ? -1 : 1
  const rows = cards.map(card => ({ card, sort: sortValue(input.sortBy, card), isNew: isNewCard(card) }))
  rows.sort((a, b) => {
    if (a.isNew !== b.isNew) {
      return a.isNew ? 1 : -1
    }
    if (isBlank(a.sort) && isBlank(b.sort)) return 0
    if (isBlank(a.sort)) return 1
    if (isBlank(b.sort)) return -1
    if (a.sort < b.sort) return dir
    if (a.sort > b.sort) return -dir
    return 0
  })
  return rows.map(row => row.card)
}

// CardStatsTable renders a list of column descriptors over the card list,
// leaving out columns that need data the cube doesn't have.
function CardStatsTable(cards, allColumns, input) {
  const columns = visibleItems(allColumns, input.info)

  return (
    <div className="table-scroll cards-table-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            {columns.map(function (hdr, i) {
              return (
                <HoverInfo key={i} title={hdr.text} info={hdr.tip}>
                  <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">
                    {hdr.text}{input.sortBy === hdr.id ? (input.sortInvert ? " ▲" : " ▼") : ""}
                  </td>
                </HoverInfo>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortCards(cards.filter(card => !shouldSkip(card, input)), input).map(card => (
            <tr className="widget-table-row" key={card.name}>
              {columns.map((col, ci) => col.cell(card, input, ci))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// CardWidgetTable is the Cards page's stats table. Rendering hundreds of rows
// is the slow part of the page, so it renders from a deferred copy of its
// inputs: a filter change updates the controls at once, and the rows follow
// without freezing the page.
export function CardWidgetTable(input) {
  const deferred = React.useDeferredValue(input)
  return (
    <TabbedPanel
      label={CARDS_COPY.statsTable.statsTypeLabel}
      tabs={visibleItems(CARD_STATS_TYPES, input.info)}
      active={availableValue(input.dropdownSelection, CARD_STATS_TYPES, input.info)}
      onChange={value => input.onSelected(asEvent(value))}
      actions={CARDS_COPY.statsTable.showing(countShown(input))}
    >
      <CardTableForInputs input={deferred} />
    </TabbedPanel>
  )
}

// CardTableForInputs draws the table for one set of inputs. It's memoized so
// the quick update that runs before the deferred one skips the table entirely.
const CardTableForInputs = React.memo(function CardTableForInputs({ input }) {
  let cards = []
  for (let [name, card] of input.cardData) {
    cards.push(card)
  }
  switch (availableValue(input.dropdownSelection, CARD_STATS_TYPES, input.info)) {
    case MetadataType:
      return CardStatsTable(cards, METADATA_COLUMNS, input)
    case ArchetypeMixType:
      return CardStatsTable(cards, MIX_COLUMNS, input)
    default:
      return CardStatsTable(cards, OVERVIEW_COLUMNS, input)
  }
})

// CardWidgetOptions is the Cards page's filters: the card search with quick
// chips for common roles, and the popularity switch.
export function CardWidgetOptions(input) {
  // The tag list runs to hundreds of entries, so it's only rebuilt when the
  // cube's tags change, not on every filter change.
  const tags = React.useMemo(() => searchTagValues(input.cubeCobraTags, input.cubeTags), [input.cubeCobraTags, input.cubeTags])

  // toggleQuick adds or removes a quick chip's term in the search.
  function toggleQuick(term) {
    input.onLocalMatchUpdated(asEvent(toggleTerm(input.localMatchStr, term)))
  }

  return (
    <div className="controls-panel">
      <PillSearchInput
        label={CARDS_COPY.statsTable.filterLabel}
        placeholder="Search cards (e.g. t:creature mv<=2, is:removal, pop:popular)"
        value={input.localMatchStr}
        onChange={input.onLocalMatchUpdated}
        cardNames={input.cardNames}
        tags={tags}
        target="cards"
      />

      <div className="selector-group stats-detail-row">
        <Group gap={6} className="search-chips">
          {QUICK_TERMS.map(quick => (
            <Chip
              key={quick.term}
              size="xs"
              variant="outline"
              checked={hasTerm(input.localMatchStr, quick.term)}
              onChange={() => toggleQuick(quick.term)}
              title={`Search for ${quick.term}`}
            >
              {quick.label}
            </Chip>
          ))}
        </Group>

        <HoverInfo title="Popularity" info={POPULARITY_TIP}>
          <div>
            <ChoiceHeader
              label="Popularity"
              options={POPULARITY_OPTIONS}
              value={input.popularityFilter}
              onChange={input.onPopularityFilterSelected}
            />
          </div>
        </HoverInfo>
      </div>
    </div>
  );
}

// countShown counts the cards the filters leave in the table.
function countShown(input) {
  let shown = 0
  for (const card of input.cardData.values()) {
    if (!shouldSkip(card, input)) {
      shown += 1
    }
  }
  return shown
}
