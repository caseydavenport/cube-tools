// The Cards stats table's columns: how each cell draws and how each column
// sorts, grouped into the column sets for each stats type.

import React from 'react'
import { HoverInfo } from "../../components/kit/HoverInfo.js"
import { ColorImages } from "../../utils/Colors.js"
import { CardMainboardTooltipContent } from "./CardTooltip.js"

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
    <HoverInfo key={key} title="Played by" info={CardMainboardTooltipContent(card, input.info)} position="right">
      <td id={card.name} onClick={input.onCardSelected}>
        <a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a>
        {" "}
        <a className="deck-link" href={deckLinkHref(card, input)} target="_blank" rel="noopener noreferrer"
          title="Open decks that mainboarded this card (same filters & time range)"
          onClick={(e) => e.stopPropagation()}>⧉</a>
      </td>
    </HoverInfo>
  )
}

// valueCell is a plain clickable value cell that focuses the card on click.
function valueCell(card, input, key, value) {
  return <td key={key} id={card.name} onClick={input.onCardSelected}>{value}</td>
}

// popoverValueCell is a clickable value cell with an on-hover detail popover.
function popoverValueCell(card, input, key, value, title, body) {
  return (
    <HoverInfo key={key} title={title} info={body}>
      <td id={card.name} onClick={input.onCardSelected}>{value}</td>
    </HoverInfo>
  )
}

// deckPctCell shows mainboard rate, with exact mainboard/sideboard counts on hover.
// popoverTable renders label/value rows as a compact two-column table for
// popover bodies.
function popoverTable(rows) {
  return (
    <table className="popover-table">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={i}>
            <td className="popover-table-label">{label}</td>
            <td className="popover-table-value">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function deckPctCell(card, input, key) {
  const body = popoverTable([
    ["Mainboarded", card.mainboard],
    ["Sideboarded", card.sideboard],
    ["Playable sideboard", card.playable_sideboard],
  ])
  return popoverValueCell(card, input, key, `${card.mainboard_percent.toFixed(0)}%`, "Board counts", body)
}

// winPctCell shows win rate next to its Wilson confidence interval, muted when
// the card can't be told apart from a coin flip at the chosen confidence. Full
// record and interval on hover.
function winPctCell(card, input, key) {
  const hasCI = card.win_percent_low != null && card.win_percent_high != null
  const confPct = Math.round(parseFloat(input.winConfidence || "0.8") * 100)

  const rows = [
    ["Record", `${card.wins}-${card.losses}-${card.draws}`],
    ["Win %", `${card.win_percent.toFixed(0)}%`],
  ]
  if (hasCI) {
    rows.push([`${confPct}% interval`, `${card.win_percent_low.toFixed(0)}% – ${card.win_percent_high.toFixed(0)}%`])
    rows.push(["Beats a coin flip", card.significant ? "yes" : "no"])
  }
  rows.push(["Trophies (3-0)", card.trophies])
  rows.push(["Last place (0-3)", card.last_place])
  rows.push(["% of all wins", `${card.percent_of_wins.toFixed(0)}%`])
  const body = popoverTable(rows)

  // A non-significant win rate is greyed so the eye skips the coin-flips. The
  // interval itself lives in the hover popover to keep the column uncluttered.
  const muted = hasCI && !card.significant
  const value = (
    <span style={{ color: muted ? "var(--text-muted)" : undefined }}>
      {card.win_percent.toFixed(0)}%
    </span>
  )
  return popoverValueCell(card, input, key, value, "Win detail", body)
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
  id: "colors", text: "Color Identity", tip: "Color identity of the card.",
  cell: (card, input, key) => <td key={key}>{ColorImages(card.color_identity)}</td>,
}

const cardColumn = {
  id: "card", text: "Card", tip: "Card name. Click a row cell to focus the card in the graphs below.",
  cell: cardNameCell,
}

const gamesColumn = {
  needs: ["results"],
  id: "games", text: "# Games", tip: "Number of games played by decks that included this card.",
  cell: (c, i, k) => valueCell(c, i, k, c.total_games),
}

export const OVERVIEW_COLUMNS = [
  colorsColumn,
  cardColumn,
  { needs: ["sideboards"], id: "mainboarded", text: "Deck%", tip: "Percentage of drafts this card is mainboarded. Hover for exact board counts.", cell: deckPctCell },
  { needs: ["results"], id: "wins", text: "Win%", tip: "Win rate of decks that mainboard this card. Greyed when it can't be told apart from a coin flip at the chosen confidence. Hover for the confidence interval and record.", cell: winPctCell },
  { needs: ["results"], id: "delta_exp", text: "Δ Exp", tip: "Win% minus expected win% - how the card over/underperforms relative to the players who ran it.", cell: deltaExpCell },
  { needs: ["sideboards"], id: "elo", text: "Pick ELO", tip: "An ELO ranking based on card pick order in packs.", cell: (c, i, k) => valueCell(c, i, k, c.elo) },
  { needs: ["results"], id: "match_elo", text: "Match ELO", tip: "An ELO ranking computed from match results, weighted by opponent strength.", cell: (c, i, k) => valueCell(c, i, k, c.match_elo) },
  { id: "lastPlayed", text: "Last played", tip: "Date of the draft this card was last mainboarded.", cell: (c, i, k) => valueCell(c, i, k, c.last_mainboarded) },
]

export const METADATA_COLUMNS = [
  colorsColumn,
  cardColumn,
  { id: "wordcount", text: "Words", tip: "Words in the card's oracle text, excluding reminder text.", cell: (c, i, k) => valueCell(c, i, k, c.word_count) },
  { needs: ["archetypes"], id: "labels", text: "# Tags", tip: "Number of unique tags on decks that have mainboarded this card.", cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.archetypes).length) },
  gamesColumn,
  { id: "players", text: "# Players", tip: "Number of unique players who have mainboarded this card.", cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.players).length) },
]

export const VS_ARCH_COLUMNS = [
  colorsColumn, cardColumn, gamesColumn,
  { needs: ["results", "archetypes"], id: "vsaggro", text: "vs Aggro", tip: "Win rate when this card's deck plays against aggro archetypes.", cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.aggro.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "vscontrol", text: "vs Control", tip: "Win rate when this card's deck plays against control archetypes.", cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.control.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "vsmidrange", text: "vs Midrange", tip: "Win rate when this card's deck plays against midrange archetypes.", cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.midrange.win_percent.toFixed(0)}%`) },
]

export const BY_ARCH_COLUMNS = [
  colorsColumn, cardColumn, gamesColumn,
  { needs: ["results", "archetypes"], id: "inaggro", text: "in Aggro", tip: "Win rate of this card when played in aggro decks.", cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.aggro.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "incontrol", text: "in Control", tip: "Win rate of this card when played in control decks.", cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.control.win_percent.toFixed(0)}%`) },
  { needs: ["results", "archetypes"], id: "inmidrange", text: "in Midrange", tip: "Win rate of this card when played in midrange decks.", cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.midrange.win_percent.toFixed(0)}%`) },
]
