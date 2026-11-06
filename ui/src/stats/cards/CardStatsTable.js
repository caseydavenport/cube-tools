// The Cards stats table and the controls above it: the stats-type switch,
// card search, match and tag pickers, and the significant-only checkbox.

import React from 'react'
import { DropdownHeader, Checkbox, SearchableDropdownHeader } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { asEvent } from "../../components/kit/controls.js"
import { SegmentedControl } from "@mantine/core"
import { availableValue, hasData, visibleItems } from "../../utils/dataKinds.js"
import { PillSearchInput } from "../../components/PillSearchInput.js"
import { CardMatches } from "../../utils/Query.js"
import { cardMatchesTagChoice } from "../../utils/cardRoles.js"
import { tagFilterOptions } from "../../utils/tagOptions.js"
import { CARDS_COPY } from "./copy.js"
import { POPULARITY_OPTIONS, POPULARITY_TIP, expectedByChance, matchesPopularity } from "./cardFilters.js"
import { BY_ARCH_COLUMNS, METADATA_COLUMNS, OVERVIEW_COLUMNS, VS_ARCH_COLUMNS, isNewCard, sortValue } from "./cardColumns.js"
import "../stats.css"

const Interaction = CARDS_COPY.statsTable.matchInteraction

const Counterspells = CARDS_COPY.statsTable.matchCounterspells

const Removal = CARDS_COPY.statsTable.matchRemoval

const Land = CARDS_COPY.statsTable.matchLand

const Nonland = CARDS_COPY.statsTable.matchNonland

export const matchOpts = [
  {label: "", value:""},
  {label: Interaction, value: Interaction},
  {label: Counterspells, value: Counterspells},
  {label: Removal, value: Removal},
  {label: Land, value: Land},
  {label: Nonland, value: Nonland},
]

// tagOpts drives the Tag filter dropdown. These are the cube owner's curated
// Cube Cobra tags (card.tags), kept separate from the heuristic-driven Match
// filter above. `value` is the raw tag string as it appears in the export;
// `label` is a friendlier display name. Add entries here as more tags become
// useful to filter on.
export const tagOpts = [
  {label: "", value: ""},
  {label: CARDS_COPY.statsTable.tagDna, value: "🧬"},
  {label: CARDS_COPY.statsTable.tagWatch, value: "watch"},
  {label: CARDS_COPY.statsTable.tagRemove, value: "remove"},
]

// shouldSkip returns true if the card should be skipped, and false otherwise.
export function shouldSkip(card, input) {
    let players = Object.entries(card.players)
    if (players.length < input.minPlayers) {
      return true
    }
    if (input.maxPlayers != 0 && players.length > input.maxPlayers) {
      return true
    }
    if (input.manaValue >=0 && card.cmc != input.manaValue) {
      return true
    }
    if (input.localMatchStr != "" && !CardMatches(card, input.localMatchStr, true)) {
      return true
    }

    if (!cardMatchesTagChoice(card, input.tagFilter)) {
      return true
    }

    if (!matchesPopularity(card, input.popularityFilter)) {
      return true
    }

    if (input.significantOnly && !card.significant) {
      return true
    }

    switch (input.cardFilter) {
      case Interaction:
        return !card.interaction;
      case Counterspells:
        return !card.counterspell;
      case Removal:
        return !card.removal;
      case Land:
        return !card.land;
      case Nonland:
        return card.land;
    }
    return false
  }

// CARD_STATS_TYPES are the views of the card stats table. The archetype views
// break win rates down by archetype, so they need archetype labels.
const OverviewType = CARDS_COPY.statsTable.typeOverview
const MetadataType = CARDS_COPY.statsTable.typeMetadata
const VersusArchetypeType = CARDS_COPY.statsTable.typeVersusArchetype
const ByArchetypeType = CARDS_COPY.statsTable.typeByArchetype

const CARD_STATS_TYPES = [
  { label: OverviewType, value: OverviewType },
  { label: MetadataType, value: MetadataType },
  { label: VersusArchetypeType, value: VersusArchetypeType, needs: ["results", "archetypes"] },
  { label: ByArchetypeType, value: ByArchetypeType, needs: ["results", "archetypes"] },
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
    <div className="table-scroll">
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
  return <CardTableForInputs input={deferred} />
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
    case VersusArchetypeType:
      return CardStatsTable(cards, VS_ARCH_COLUMNS, input)
    case ByArchetypeType:
      return CardStatsTable(cards, BY_ARCH_COLUMNS, input)
    default:
      return CardStatsTable(cards, OVERVIEW_COLUMNS, input)
  }
})

export function CardWidgetOptions(input) {
  // The tag list runs to hundreds of options, so it's only rebuilt when the
  // cube's tags change, not on every filter change.
  const tagData = React.useMemo(() => tagFilterOptions(input.tagOpts, input.cubeTags), [input.tagOpts, input.cubeTags])

  const counts = countCards(input)

  return (
    <div className="controls-panel">
      <PillSearchInput
        label={CARDS_COPY.statsTable.filterLabel}
        placeholder={CARDS_COPY.statsTable.filterPlaceholder}
        value={input.localMatchStr}
        onChange={input.onLocalMatchUpdated}
        cardNames={input.cardNames}
      />

      <div className="selector-group stats-detail-row">
        <div className="selection-cell stats-detail-label">
          {CARDS_COPY.statsTable.showing(counts.shown)}
        </div>

        <SegmentedControl
          size="xs"
          aria-label={CARDS_COPY.statsTable.statsTypeLabel}
          data={visibleItems(CARD_STATS_TYPES, input.info)}
          value={availableValue(input.dropdownSelection, CARD_STATS_TYPES, input.info)}
          onChange={value => input.onSelected(asEvent(value))}
        />

        <DropdownHeader
          label={CARDS_COPY.statsTable.matchLabel}
          options={input.matchOpts}
          value={input.cardFilter}
          onChange={input.onCardFilterSelected}
        />

        <SearchableDropdownHeader
          label={CARDS_COPY.statsTable.tagLabel}
          placeholder="Any"
          data={tagData}
          value={input.tagFilter}
          onChange={input.onTagFilterSelected}
        />

        <HoverInfo title="Popularity" info={POPULARITY_TIP}>
          <div>
            <DropdownHeader
              label="Popularity"
              options={POPULARITY_OPTIONS}
              value={input.popularityFilter}
              onChange={input.onPopularityFilterSelected}
            />
          </div>
        </HoverInfo>

        <SignificantOnly {...input} tested={counts.tested} />
      </div>
    </div>
  );
}

// countCards counts the cards the filters show, and how many of them, with
// "Significant only" left off, have games: the cards the significance test
// runs on.
function countCards(input) {
  const withoutSignificance = { ...input, significantOnly: false }
  let shown = 0
  let tested = 0
  for (const card of input.cardData.values()) {
    if (!shouldSkip(card, input)) {
      shown += 1
    }
    if (!shouldSkip(card, withoutSignificance) && card.total_games > 0) {
      tested += 1
    }
  }
  return { shown, tested }
}

// SignificantOnly is the checkbox that keeps only cards whose win rate beats a
// coin flip, with how many of the tested cards would pass by luck alone. It
// needs match results to mean anything.
function SignificantOnly(input) {
  if (!hasData(input.info, "results")) {
    return null
  }

  const confidence = Math.round(parseFloat(input.winConfidence) * 100)
  const chance = expectedByChance(input.tested, input.winConfidence)
  const tip = `At ${confidence}% confidence, about ${chance} of these ${input.tested} cards would pass by luck alone, even if no card changed win rate. Treat a passing count near ${chance} as noise.`

  return (
    <div className="cards-significant">
      <Checkbox
        text={CARDS_COPY.statsTable.significantOnly}
        checked={input.significantOnly}
        onChange={input.onSignificantOnlyToggled}
      />
      <HoverInfo title="Expected by chance" info={tip}>
        <span className="stats-muted cards-chance-note">~{chance} by chance</span>
      </HoverInfo>
    </div>
  )
}
