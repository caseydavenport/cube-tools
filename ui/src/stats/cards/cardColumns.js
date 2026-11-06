// The Cards stats table's columns: how each cell draws and how each column
// sorts, grouped into the column sets for each stats type.

import React from 'react'
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { HoverStats } from "../../components/kit/HoverStats.js"
import { ColorImages } from "../../utils/Colors.js"
import { CardMainboardTooltipContent } from "./CardTooltip.js"
import { CardLink } from "../../components/CardLink.js"
import { NEW_CARD_DRAFTS, isNewCard as isNewDraftCount } from "../../cards/newCard.js"
import { CARDS_COPY } from "./copy.js"
import { POPULARITY_TIP, popularityLabel } from "./cardFilters.js"
import "../stats.css"

function colorSort(card) {
  if (card.colors == null || card.colors.length === 0) {
    return "A"
  } else if (card.colors.length > 1) {
    return "A" + card.colors.toString()
  }
  return card.colors.toString()
}

// playRateSort is the value the Popularity column sorts by: the play rate, or
// blank (NaN, so it sinks) for a card no fully recorded deck took.
function playRateSort(card) {
  if (!card.drafts_taken) {
    return NaN
  }
  return card.play_rate
}

// sortValue is the value a card sorts by for the chosen column. With no column
// chosen the table sorts by Popularity, the most reliable play number.
export function sortValue(sortBy, card) {
  let sort = playRateSort(card)
  switch (sortBy) {
    case "games":
      sort = card.total_games
      break
    case "drafts":
      sort = card.drafts || 0
      break
    case "mb":
      sort = card.mainboard
      break
    case "sb":
      sort = card.sideboard
      break
    case "popularity":
      sort = playRateSort(card)
      break
    case "elo":
      sort = card.elo
      break
    case "in-color-sb":
      sort = card.playable_sideboard
      break
    case "players":
      let players = Object.entries(card.players)
      sort = players.length
      break
    case "lastPlayed":
      sort = card.last_mainboarded
      break
    case "wordcount":
      sort = card.word_count
      break
    case "colors":
      sort = colorSort(card)
      break
    case "labels":
      sort = Object.entries(card.archetypes).length
      break
    case "trophies":
      sort = card.trophies
      break
    case "last_place":
      sort = card.last_place
      break
    case "pow":
      sort = card.percent_of_wins
      break;
    case "#wins":
      sort = card.wins
      break;
    case "draws":
      sort = card.draws
      break;
    case "vsaggro":
      sort = card.against_archetype.aggro.win_percent
      break;
    case "vsmidrange":
      sort = card.against_archetype.midrange.win_percent
      break;
    case "vscontrol":
      sort = card.against_archetype.control.win_percent
      break;
    case "inaggro":
      sort = card.by_archetype.aggro.win_percent
      break;
    case "inmidrange":
      sort = card.by_archetype.midrange.win_percent
      break;
    case "incontrol":
      sort = card.by_archetype.control.win_percent
      break;
  }
  return sort
}

// ---------------------------------------------------------------------------
// Card stats table.
//
// One renderer drives every mode; a mode is just a list of column descriptors
// {id, text, tip, cell}, where cell(card, input, key) returns the <td>. The
// default "Overview" mode leads with how often the card is played; its board
// counts and win rate sit in the Popularity cell's hover.
// ---------------------------------------------------------------------------

// currentCubeId pulls the cube segment out of the HashRouter URL (#/{cube}/...).
function currentCubeId() {
  const m = (window.location.hash || "").match(/#\/([^/?]+)/)
  return m ? m[1] : ""
}

// deckLinkHref builds a link to the Decklists page filtered to decks that
// mainboarded this card, carrying the current deck filter and time range so a
// new tab reproduces the same view.
function deckLinkHref(card, input) {
  const query = [input.matchStr, `name:"${card.name}"`].filter(s => s && s.trim()).join(" ")
  const params = new URLSearchParams()
  if (input.startDate) params.set("start", input.startDate)
  if (input.endDate) params.set("end", input.endDate)
  params.set("match", query)
  return `${window.location.pathname}#/${currentCubeId()}/decks?${params.toString()}`
}

// isNewCard reports whether a card has been in too few drafts to compare
// fairly against the rest of the cube.
export function isNewCard(card) {
  return isNewDraftCount(card.drafts || 0)
}

// newCardBadge marks a card that has been in too few drafts for its numbers
// to mean much yet.
function newCardBadge(card) {
  if (!isNewCard(card)) {
    return null
  }
  const tip = `In fewer than ${NEW_CARD_DRAFTS} drafts so far, so its numbers are thin. Sorted below the other cards.`
  return <span className="cards-new-badge" title={tip}>new</span>
}

// cardNameCell renders the card name, linking to its card page, with a "played
// by" popover, plus a link that opens the decks which mainboarded the card in a
// new tab.
function cardNameCell(card, input, key) {
  return (
    <HoverInfo key={key} title={CARDS_COPY.columns.playedByTitle} info={<CardMainboardTooltipContent card={card} info={input.info} />} position="right">
      <td id={card.name} onClick={input.onCardSelected}>
        <CardLink cube={currentCubeId()} name={card.name} onClick={(e) => e.stopPropagation()} />
        {newCardBadge(card)}
        {" "}
        <a className="deck-link" href={deckLinkHref(card, input)} target="_blank" rel="noopener noreferrer"
          title={CARDS_COPY.columns.deckLinkTip}
          onClick={(e) => e.stopPropagation()}>⧉</a>
      </td>
    </HoverInfo>
  )
}

// valueCell is a plain clickable value cell that focuses the card on click.
function valueCell(card, input, key, value) {
  return <td key={key} id={card.name} onClick={input.onCardSelected}>{value}</td>
}

// statsValueCell is a clickable value cell with an on-hover popover of
// label-and-value rows.
function statsValueCell(card, input, key, value, title, rows) {
  return (
    <HoverStats key={key} title={title} rows={rows}>
      <td id={card.name} onClick={input.onCardSelected}>{value}</td>
    </HoverStats>
  )
}

// popularityRows are the Popularity hover's rows: the popularity word, the
// draft counts behind the rate, the card's deck counts by board, and, when
// its decks played games, their record and win %. Per-card win rates are
// mostly luck at this sample size, so they stay out of the table itself.
function popularityRows(card) {
  const rows = []
  if (card.popularity) {
    rows.push({ label: "Popularity", value: popularityLabel(card.popularity) })
  }
  rows.push(
    { label: "Drafts a deck took it", value: card.drafts_taken },
    { label: "Drafts it was played", value: card.drafts_played },
    { label: CARDS_COPY.columns.mainboarded, value: card.mainboard },
    { label: CARDS_COPY.columns.sideboarded, value: card.sideboard },
    { label: CARDS_COPY.columns.playableSideboard, value: card.playable_sideboard },
  )
  if (card.total_games > 0) {
    rows.push(
      { label: CARDS_COPY.columns.record, value: `${card.wins}-${card.losses}-${card.draws}` },
      { label: CARDS_COPY.columns.winPercent, value: `${card.win_percent.toFixed(0)}%` },
    )
  }
  return rows
}

// popularityCell shows the card's play rate: the share of drafts where a deck
// took it that it was mainboarded. The popularity word and the counts behind
// it are on hover. A dash when no fully recorded deck took it.
function popularityCell(card, input, key) {
  if (!card.drafts_taken) {
    return <td key={key} id={card.name} onClick={input.onCardSelected} className="stats-muted">—</td>
  }
  const value = `${Math.round(card.play_rate)}%`
  return statsValueCell(card, input, key, value, "Popularity", popularityRows(card))
}

const colorsColumn = {
  id: "colors", text: CARDS_COPY.columns.colorIdentity.text, tip: CARDS_COPY.columns.colorIdentity.tip,
  cell: (card, input, key) => <td key={key} className="stats-narrow-cell">{ColorImages(card.color_identity)}</td>,
}

const draftsColumn = {
  id: "drafts", text: "# Drafts",
  tip: `Number of drafts this card has been in, as a main deck, sideboard or pool card. Cards in fewer than ${NEW_CARD_DRAFTS} are marked new.`,
  cell: (c, i, k) => valueCell(c, i, k, c.drafts || 0),
}

const cardColumn = {
  id: "card", text: CARDS_COPY.columns.card.text, tip: CARDS_COPY.columns.card.tip,
  cell: cardNameCell,
}

const gamesColumn = {
  needs: ["results"],
  id: "games", text: CARDS_COPY.columns.games.text, tip: CARDS_COPY.columns.games.tip,
  cell: (c, i, k) => valueCell(c, i, k, c.total_games),
}

// OVERVIEW_COLUMNS show only numbers that hold up when the drafts are split in
// half: how often the card is played and how it's picked. Win rate is in the
// Popularity hover.
export const OVERVIEW_COLUMNS = [
  cardColumn,
  colorsColumn,
  draftsColumn,
  { id: "popularity", text: "Popularity", tip: POPULARITY_TIP, cell: popularityCell },
  { needs: ["sideboards"], id: "elo", text: CARDS_COPY.columns.pickElo.text, tip: CARDS_COPY.columns.pickElo.tip, cell: (c, i, k) => valueCell(c, i, k, c.elo) },
  { id: "lastPlayed", text: CARDS_COPY.columns.lastPlayed.text, tip: CARDS_COPY.columns.lastPlayed.tip, cell: (c, i, k) => valueCell(c, i, k, c.last_mainboarded) },
]

export const METADATA_COLUMNS = [
  cardColumn,
  colorsColumn,
  { id: "wordcount", text: CARDS_COPY.columns.words.text, tip: CARDS_COPY.columns.words.tip, cell: (c, i, k) => valueCell(c, i, k, c.word_count) },
  { needs: ["archetypes"], id: "labels", text: CARDS_COPY.columns.tags.text, tip: CARDS_COPY.columns.tags.tip, cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.archetypes).length) },
  gamesColumn,
  { id: "players", text: CARDS_COPY.columns.players.text, tip: CARDS_COPY.columns.players.tip, cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.players).length) },
]

export const VS_ARCH_COLUMNS = [
  cardColumn, colorsColumn, gamesColumn,
  { needs: ["results", "archetypes"], id: "vsaggro", text: CARDS_COPY.columns.vsAggro.text, tip: CARDS_COPY.columns.vsAggro.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.aggro.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "vscontrol", text: CARDS_COPY.columns.vsControl.text, tip: CARDS_COPY.columns.vsControl.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.control.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "vsmidrange", text: CARDS_COPY.columns.vsMidrange.text, tip: CARDS_COPY.columns.vsMidrange.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.midrange.win_percent.toFixed(0)}%`) },
]

export const BY_ARCH_COLUMNS = [
  cardColumn, colorsColumn, gamesColumn,
  { needs: ["results", "archetypes"], id: "inaggro", text: CARDS_COPY.columns.inAggro.text, tip: CARDS_COPY.columns.inAggro.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.aggro.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "incontrol", text: CARDS_COPY.columns.inControl.text, tip: CARDS_COPY.columns.inControl.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.control.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "inmidrange", text: CARDS_COPY.columns.inMidrange.text, tip: CARDS_COPY.columns.inMidrange.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.midrange.win_percent.toFixed(0)}%`) },
]
