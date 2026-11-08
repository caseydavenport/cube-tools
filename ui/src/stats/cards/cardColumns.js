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
import { POPULARITY_TIP, macroDecks, macroShare, popularityLabel } from "./cardFilters.js"
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
  if (!card.times_taken) {
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
    case "wins":
      sort = winSort(card)
      break
    case "macro_decks":
      sort = macroDecks(card)
      break
    case "mix_aggro":
      sort = macroShare(card, "aggro")
      break
    case "mix_midrange":
      sort = macroShare(card, "midrange")
      break
    case "mix_control":
      sort = macroShare(card, "control")
      break
  }
  return sort
}

// winSort is the value the Win % column sorts by, blank (NaN, so it sinks)
// for a card whose decks played no games.
function winSort(card) {
  if (!card.total_games) {
    return NaN
  }
  return card.win_percent
}

// ---------------------------------------------------------------------------
// Card stats table.
//
// One renderer drives every mode; a mode is just a list of column descriptors
// {id, text, tip, cell}, where cell(card, input, key) returns the <td>. The
// default "Overview" mode leads with how often the card is played; its board
// counts sit in the Popularity cell's hover.
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
// copy counts behind the rate, and the card's deck counts by board.
function popularityRows(card) {
  const rows = []
  if (card.popularity) {
    rows.push({ label: "Popularity", value: popularityLabel(card.popularity) })
  }
  rows.push(
    { label: "Times a deck took it", value: card.times_taken },
    { label: "Times it was played", value: card.times_played },
    { label: CARDS_COPY.columns.mainboarded, value: card.mainboard },
    { label: CARDS_COPY.columns.sideboarded, value: card.sideboard },
    { label: CARDS_COPY.columns.playableSideboard, value: card.playable_sideboard },
  )
  return rows
}

// popularityCell shows the card's play rate: the share of the copies decks
// took that they mainboarded. The popularity word and the counts behind it are
// on hover. A dash when no fully recorded deck took it.
function popularityCell(card, input, key) {
  if (!card.times_taken) {
    return <td key={key} id={card.name} onClick={input.onCardSelected} className="stats-muted">—</td>
  }
  const value = `${Math.round(card.play_rate)}%`
  return statsValueCell(card, input, key, value, "Popularity", popularityRows(card))
}

// winPctCell shows the win rate of the card's decks, always greyed since a
// single card's win rate is mostly luck at this sample size. The record and
// games are on hover. A dash when its decks played no games.
function winPctCell(card, input, key) {
  if (!card.total_games) {
    return <td key={key} id={card.name} onClick={input.onCardSelected} className="stats-muted">—</td>
  }
  const rows = [
    { label: CARDS_COPY.columns.record, value: `${card.wins}-${card.losses}-${card.draws}` },
    { label: CARDS_COPY.columns.games.text, value: card.total_games },
  ]
  const value = <span className="stats-muted">{Math.round(card.win_percent)}%</span>
  return statsValueCell(card, input, key, value, CARDS_COPY.columns.winPct.text, rows)
}

// mixCell shows the share of the card's macro-labeled decks that were one
// macro archetype, or a dash when none of its decks had one.
function mixCell(card, input, key, macro) {
  const share = macroShare(card, macro)
  if (Number.isNaN(share)) {
    return <td key={key} id={card.name} onClick={input.onCardSelected} className="stats-muted">—</td>
  }
  return valueCell(card, input, key, `${Math.round(share)}%`)
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

// OVERVIEW_COLUMNS lead with the numbers that hold up when the drafts are
// split in half, how often the card is played and how it's picked, then the
// win rate, greyed and marked unreliable.
export const OVERVIEW_COLUMNS = [
  cardColumn,
  colorsColumn,
  draftsColumn,
  { id: "popularity", text: "Popularity", tip: POPULARITY_TIP, cell: popularityCell },
  { needs: ["sideboards"], id: "elo", text: CARDS_COPY.columns.pickElo.text, tip: CARDS_COPY.columns.pickElo.tip, cell: (c, i, k) => valueCell(c, i, k, c.elo) },
  { needs: ["results"], id: "wins", text: CARDS_COPY.columns.winPct.text, tip: CARDS_COPY.columns.winPct.tip, cell: winPctCell },
]

export const METADATA_COLUMNS = [
  cardColumn,
  colorsColumn,
  { id: "wordcount", text: CARDS_COPY.columns.words.text, tip: CARDS_COPY.columns.words.tip, cell: (c, i, k) => valueCell(c, i, k, c.word_count) },
  { needs: ["archetypes"], id: "labels", text: CARDS_COPY.columns.tags.text, tip: CARDS_COPY.columns.tags.tip, cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.archetypes).length) },
  gamesColumn,
  { id: "players", text: CARDS_COPY.columns.players.text, tip: CARDS_COPY.columns.players.tip, cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.players).length) },
  { id: "lastPlayed", text: CARDS_COPY.columns.lastPlayed.text, tip: CARDS_COPY.columns.lastPlayed.tip, cell: (c, i, k) => valueCell(c, i, k, c.last_mainboarded) },
]

// MIX_COLUMNS show which macro archetypes play each card: of its decks with a
// macro archetype, the share that were aggro, midrange and control.
export const MIX_COLUMNS = [
  cardColumn,
  colorsColumn,
  { id: "macro_decks", text: "Decks", tip: "Decks that mainboarded the card and have a macro archetype. The shares are out of these.", cell: (c, i, k) => valueCell(c, i, k, macroDecks(c)) },
  { id: "mix_aggro", text: "Aggro", tip: "Share of the card's decks that were aggro.", cell: (c, i, k) => mixCell(c, i, k, "aggro") },
  { id: "mix_midrange", text: "Midrange", tip: "Share of the card's decks that were midrange.", cell: (c, i, k) => mixCell(c, i, k, "midrange") },
  { id: "mix_control", text: "Control", tip: "Share of the card's decks that were control.", cell: (c, i, k) => mixCell(c, i, k, "control") },
]
