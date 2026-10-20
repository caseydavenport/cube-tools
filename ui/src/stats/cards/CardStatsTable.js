// The Cards stats table and the controls above it: the stats-type switch,
// card search, match and tag pickers, and the significant-only checkbox.

import React from 'react'
import { DropdownHeader, Checkbox } from "../../components/Dropdown.js"
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { asEvent } from "../../components/kit/controls.js"
import { SegmentedControl } from "@mantine/core"
import { availableValue, hasData, visibleItems } from "../../utils/dataKinds.js"
import { PillSearchInput } from "../../components/PillSearchInput.js"
import { CardMatches } from "../../utils/Query.js"
import { BY_ARCH_COLUMNS, METADATA_COLUMNS, OVERVIEW_COLUMNS, VS_ARCH_COLUMNS, sortValue } from "./cardColumns.js"

const Interaction = "All interaction"

const Counterspells = "Counterspells"

const Removal = "Removal"

const Land = "Land"

const Nonland = "Nonland"

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
  {label: "DNA", value: "🧬"},
  {label: "Watch", value: "watch"},
  {label: "Remove", value: "remove"},
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

    if (input.tagFilter && !(card.tags || []).includes(input.tagFilter)) {
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
const CARD_STATS_TYPES = [
  { label: "Overview", value: "Overview" },
  { label: "Metadata", value: "Metadata" },
  { label: "Versus archetype", value: "Versus archetype", needs: ["results", "archetypes"] },
  { label: "By archetype", value: "By archetype", needs: ["results", "archetypes"] },
]

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
          {(() => {
            let rows = cards.filter(card => !shouldSkip(card, input)).map(function (card) {
              let sort = sortValue(input.sortBy, card)
              return (
                <tr className="widget-table-row" sort={sort} key={card.name}>
                  {columns.map((col, ci) => col.cell(card, input, ci))}
                </tr>
              )
            })
            // Descending by default; sortInvert flips to ascending. Blank (NaN)
            // sort values always sink to the bottom, regardless of direction.
            const dir = input.sortInvert ? -1 : 1
            const blank = v => v === undefined || v === null || (typeof v === "number" && Number.isNaN(v))
            rows.sort((a, b) => {
              const av = a.props.sort, bv = b.props.sort
              if (blank(av) && blank(bv)) return 0
              if (blank(av)) return 1
              if (blank(bv)) return -1
              if (av < bv) return dir
              if (av > bv) return -dir
              return 0
            })
            return rows
          })()}
        </tbody>
      </table>
    </div>
  )
}

export function CardWidgetTable(input) {
  let cards = []
  for (let [name, card] of input.cardData) {
    cards.push(card)
  }
  switch (availableValue(input.dropdownSelection, CARD_STATS_TYPES, input.info)) {
    case "Metadata":
      return CardStatsTable(cards, METADATA_COLUMNS, input)
    case "Versus archetype":
      return CardStatsTable(cards, VS_ARCH_COLUMNS, input)
    case "By archetype":
      return CardStatsTable(cards, BY_ARCH_COLUMNS, input)
    default:
      return CardStatsTable(cards, OVERVIEW_COLUMNS, input)
  }
}

export function CardWidgetOptions(input) {
  let num = 0
  for (let [name, card] of input.cardData) {
    if (shouldSkip(card, input)) {
      continue
    }
    num += 1
  }

  return (
    <div className="controls-panel">
      <PillSearchInput
        label="Filter Cards"
        placeholder="Search visible cards (e.g. name:bolt, t:creature)"
        value={input.localMatchStr}
        onChange={input.onLocalMatchUpdated}
        cardNames={input.cardNames}
      />

      <div className="selector-group" style={{justifyContent: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem'}}>
        <div className="selection-cell" style={{"fontWeight": "bold", "color": "var(--primary)", "minWidth": "120px"}}>
          Showing {num} cards
        </div>

        <SegmentedControl
          size="xs"
          aria-label="Stats type"
          data={visibleItems(CARD_STATS_TYPES, input.info)}
          value={availableValue(input.dropdownSelection, CARD_STATS_TYPES, input.info)}
          onChange={value => input.onSelected(asEvent(value))}
        />

        <DropdownHeader
          label="Match"
          options={input.matchOpts}
          value={input.cardFilter}
          onChange={input.onCardFilterSelected}
        />

        <DropdownHeader
          label="Tag"
          options={input.tagOpts}
          value={input.tagFilter}
          onChange={input.onTagFilterSelected}
        />

        <SignificantOnly {...input} />
      </div>
    </div>
  );
}

// SignificantOnly is the checkbox that keeps only cards whose win rate beats a
// coin flip. It needs match results to mean anything.
function SignificantOnly(input) {
  if (!hasData(input.info, "results")) {
    return null
  }

  return (
    <Checkbox
      text="Significant only"
      checked={input.significantOnly}
      onChange={input.onSignificantOnlyToggled}
    />
  )
}
