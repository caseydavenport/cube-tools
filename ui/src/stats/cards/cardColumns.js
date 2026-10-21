// The Cards stats table's columns: how each cell draws and how each column
// sorts, grouped into the column sets for each stats type.

import React from 'react'
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { HoverStats } from "../../components/kit/HoverStats.js"
import { ColorImages } from "../../utils/Colors.js"
import { CardMainboardTooltipContent } from "./CardTooltip.js"
import { CARDS_COPY } from "./copy.js"

function colorSort(card) {
  if (card.colors == null || card.colors.length === 0) {
    return "A"
  } else if (card.colors.length > 1) {
    return "A" + card.colors.toString()
  }
  return card.colors.toString()
}

export function sortValue(sortBy, card) {
  let sort = card.mainboard_percent
  switch (sortBy) {
    case "mainboarded":
      sort = card.mainboard_percent
      break
    case "games":
      sort = card.total_games
      break
    case "mb":
      sort = card.mainboard
      break
    case "sb":
      sort = card.sideboard
      break
    case "elo":
      sort = card.elo
      break
    case "match_elo":
      sort = card.match_elo
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
    case "wins":
      sort = card.win_percent
      break
    case "colors":
      sort = colorSort(card)
      break
    case "labels":
      sort = Object.entries(card.archetypes).length
      break
    case "expected_win_percent":
      sort = card.expected_win_percent
      break;
    case "delta_exp":
      // Cards with no expected win % (too few games) are blank (NaN) so they sink
      // to the bottom in both sort directions rather than sorting as if their
      // whole win rate were the delta.
      sort = card.expected_win_percent ? (card.win_percent - card.expected_win_percent) : NaN
      break;
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
// default "Overview" mode puts play rate and win rate side by side, with the
// exact board counts and win detail tucked into per-cell hover popovers.
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

// cardNameCell renders the clickable card name with a "played by" popover, plus a
// link that opens the decks which mainboarded the card in a new tab.
function cardNameCell(card, input, key) {
  return (
    <HoverInfo key={key} title={CARDS_COPY.columns.playedByTitle} info={<CardMainboardTooltipContent card={card} info={input.info} />} position="right">
      <td id={card.name} onClick={input.onCardSelected}>
        <a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a>
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

// deckPctCell shows mainboard rate, with exact mainboard/sideboard counts on hover.
function deckPctCell(card, input, key) {
  const rows = [
    { label: CARDS_COPY.columns.mainboarded, value: card.mainboard },
    { label: CARDS_COPY.columns.sideboarded, value: card.sideboard },
    { label: CARDS_COPY.columns.playableSideboard, value: card.playable_sideboard },
  ]
  return statsValueCell(card, input, key, `${card.mainboard_percent.toFixed(0)}%`, CARDS_COPY.columns.boardCountsTitle, rows)
}

// winPctCell shows win rate next to its Wilson confidence interval, muted when
// the card can't be told apart from a coin flip at the chosen confidence. Full
// record and interval on hover.
function winPctCell(card, input, key) {
  const hasCI = card.win_percent_low != null && card.win_percent_high != null
  const confPct = Math.round(parseFloat(input.winConfidence || "0.8") * 100)

  const rows = [
    { label: CARDS_COPY.columns.record, value: `${card.wins}-${card.losses}-${card.draws}` },
    { label: CARDS_COPY.columns.winPercent, value: `${card.win_percent.toFixed(0)}%`, share: card.win_percent / 100 },
  ]
  if (hasCI) {
    rows.push({ label: CARDS_COPY.columns.interval(confPct), value: `${card.win_percent_low.toFixed(0)}% – ${card.win_percent_high.toFixed(0)}%` })
    rows.push({ label: CARDS_COPY.columns.beatsCoinFlip, value: card.significant ? CARDS_COPY.columns.yes : CARDS_COPY.columns.no })
  }
  rows.push({ label: CARDS_COPY.columns.trophies, value: card.trophies })
  rows.push({ label: CARDS_COPY.columns.lastPlace, value: card.last_place })
  rows.push({ label: CARDS_COPY.columns.percentOfWins, value: `${card.percent_of_wins.toFixed(0)}%`, share: card.percent_of_wins / 100 })

  // A non-significant win rate is greyed so the eye skips the coin-flips. The
  // interval itself lives in the hover popover to keep the column uncluttered.
  const muted = hasCI && !card.significant
  const value = (
    <span style={{ color: muted ? "var(--text-muted)" : undefined }}>
      {card.win_percent.toFixed(0)}%
    </span>
  )
  return statsValueCell(card, input, key, value, CARDS_COPY.columns.winDetailTitle, rows)
}

// deltaExpCell shows Win% minus expected Win%, coloured. Blank when there's no
// expected win % (too few games to establish a baseline).
function deltaExpCell(card, input, key) {
  if (!card.expected_win_percent) {
    return <td key={key} id={card.name} onClick={input.onCardSelected} style={{ color: "var(--text-muted)" }}>—</td>
  }
  const d = Math.round(card.win_percent - card.expected_win_percent)
  let color = "var(--se-bad)"
  if (d >= 0) {
    color = "var(--se-good)"
  }
  return <td key={key} id={card.name} onClick={input.onCardSelected} style={{ color }}>{d > 0 ? "+" : ""}{d}</td>
}

const colorsColumn = {
  id: "colors", text: CARDS_COPY.columns.colorIdentity.text, tip: CARDS_COPY.columns.colorIdentity.tip,
  cell: (card, input, key) => <td key={key}>{ColorImages(card.color_identity)}</td>,
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

export const OVERVIEW_COLUMNS = [
  colorsColumn,
  cardColumn,
  { needs: ["sideboards"], id: "mainboarded", text: CARDS_COPY.columns.deckPct.text, tip: CARDS_COPY.columns.deckPct.tip, cell: deckPctCell },
  { needs: ["results"], id: "wins", text: CARDS_COPY.columns.winPct.text, tip: CARDS_COPY.columns.winPct.tip, cell: winPctCell },
  { needs: ["results"], id: "delta_exp", text: CARDS_COPY.columns.deltaExp.text, tip: CARDS_COPY.columns.deltaExp.tip, cell: deltaExpCell },
  { needs: ["sideboards"], id: "elo", text: CARDS_COPY.columns.pickElo.text, tip: CARDS_COPY.columns.pickElo.tip, cell: (c, i, k) => valueCell(c, i, k, c.elo) },
  { needs: ["results"], id: "match_elo", text: CARDS_COPY.columns.matchElo.text, tip: CARDS_COPY.columns.matchElo.tip, cell: (c, i, k) => valueCell(c, i, k, c.match_elo) },
  { id: "lastPlayed", text: CARDS_COPY.columns.lastPlayed.text, tip: CARDS_COPY.columns.lastPlayed.tip, cell: (c, i, k) => valueCell(c, i, k, c.last_mainboarded) },
]

export const METADATA_COLUMNS = [
  colorsColumn,
  cardColumn,
  { id: "wordcount", text: CARDS_COPY.columns.words.text, tip: CARDS_COPY.columns.words.tip, cell: (c, i, k) => valueCell(c, i, k, c.word_count) },
  { needs: ["archetypes"], id: "labels", text: CARDS_COPY.columns.tags.text, tip: CARDS_COPY.columns.tags.tip, cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.archetypes).length) },
  gamesColumn,
  { id: "players", text: CARDS_COPY.columns.players.text, tip: CARDS_COPY.columns.players.tip, cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.players).length) },
]

export const VS_ARCH_COLUMNS = [
  colorsColumn, cardColumn, gamesColumn,
  { needs: ["results", "archetypes"], id: "vsaggro", text: CARDS_COPY.columns.vsAggro.text, tip: CARDS_COPY.columns.vsAggro.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.aggro.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "vscontrol", text: CARDS_COPY.columns.vsControl.text, tip: CARDS_COPY.columns.vsControl.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.control.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "vsmidrange", text: CARDS_COPY.columns.vsMidrange.text, tip: CARDS_COPY.columns.vsMidrange.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.midrange.win_percent.toFixed(0)}%`) },
]

export const BY_ARCH_COLUMNS = [
  colorsColumn, cardColumn, gamesColumn,
  { needs: ["results", "archetypes"], id: "inaggro", text: CARDS_COPY.columns.inAggro.text, tip: CARDS_COPY.columns.inAggro.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.aggro.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "incontrol", text: CARDS_COPY.columns.inControl.text, tip: CARDS_COPY.columns.inControl.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.control.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "inmidrange", text: CARDS_COPY.columns.inMidrange.text, tip: CARDS_COPY.columns.inMidrange.tip, cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.midrange.win_percent.toFixed(0)}%`) },
]
