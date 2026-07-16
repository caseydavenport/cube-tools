import React from 'react'
import { IsBasicLand, SortFunc, CardImageURL } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { PillSearchInput } from "../components/PillSearchInput.js"
import { Section, SectionNav } from "../components/PageSections.js"
import { Wins, Losses } from "../utils/Deck.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { ColorImages, Colors, CUBE_AVG_WIN_PERCENT, deltaPositiveFill, deltaNegativeFill } from "../utils/Colors.js"
import { CardMatches, DeckMatches } from "../utils/Query.js"
import { bucketTicks } from "../utils/Buckets.js"

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import {
  Tooltip as TooltipJS,
} from 'react-bootstrap';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar, Scatter } from 'react-chartjs-2';

// Register chart JS objects that we need to use.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Chart configuration.
const chartHeight = "1000px"
const chartWidth = "300px"
const ticks = {
  color: "#FFF",
  font: {
    size: 16,
  },
}

export const NumDecksOption = "# Decks"
export const NumSideboardOption = "# Sideboard"
export const MainboardPercentOption = "Mainboard %"
export const SideboardPercentOption = "Sideboard %"
export const WinPercentOption = "Win %"
export const WinPercentVsAvgOption = "Win % vs avg"
export const PercentOfWinsOption = "% of Wins"
export const NumberOfWinsOption = "# Wins"
export const ExpectedWinPercentOption = "Expected Win %"
export const ELOOption = "Pick ELO"
export const MatchELOOption = "Match ELO"
export const NumGamesOption = "# Games"
export const ManaValueOption = "Mana Value"
export const NumPlayersOption = "# Players"
export const DraftOrderOption = "Avg. draft pick"
export const NumTrophiesOption = "# Trophies"
export const NumLastPlaceOption = "# Last place"
export const VersusAggroOption = "vs Aggro Win %"
export const VersusControlOption = "vs Control Win %"
export const VersusMidrangeOption = "vs Midrange Win %"
export const InAggroOption = "in Aggro Win %"
export const InControlOption = "in Control Win %"
export const InMidrangeOption = "in Midrange Win %"
export const WordCountOption = "Word Count"

export const CardScatterAxes = [
  {label: NumDecksOption, value: NumDecksOption},
  {label: NumSideboardOption, value: NumSideboardOption},
  {label: MainboardPercentOption, value: MainboardPercentOption},
  {label: SideboardPercentOption, value: SideboardPercentOption},
  {label: WinPercentOption, value: WinPercentOption},
  {label: WinPercentVsAvgOption, value: WinPercentVsAvgOption},
  {label: PercentOfWinsOption, value: PercentOfWinsOption},
  {label: NumberOfWinsOption, value: NumberOfWinsOption},
  {label: ExpectedWinPercentOption, value: ExpectedWinPercentOption},
  {label: ELOOption, value: ELOOption},
  {label: MatchELOOption, value: MatchELOOption},
  {label: NumGamesOption, value: NumGamesOption},
  {label: ManaValueOption, value: ManaValueOption},
  {label: NumPlayersOption, value: NumPlayersOption},
  {label: DraftOrderOption, value: DraftOrderOption},
  {label: NumTrophiesOption, value: NumTrophiesOption},
  {label: NumLastPlaceOption, value: NumLastPlaceOption},
  {label: VersusAggroOption, value: VersusAggroOption},
  {label: VersusControlOption, value: VersusControlOption},
  {label: VersusMidrangeOption, value: VersusMidrangeOption},
  {label: InAggroOption, value: InAggroOption},
  {label: InControlOption, value: InControlOption},
  {label: InMidrangeOption, value: InMidrangeOption},
  {label: WordCountOption, value: WordCountOption},
]

const Interaction = "All interaction"
const Counterspells = "Counterspells"
const Removal = "Removal"
const Land = "Land"
const Nonland = "Nonland"
const matchOpts = [
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
const tagOpts = [
  {label: "", value: ""},
  {label: "DNA", value: "🧬"},
]

  // shouldSkip returns true if the card should be skipped, and false otherwise.
  function shouldSkip(card, input) {
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


const CARD_SECTIONS = [
  { id: "stats", label: "Stats" },
  { id: "trends", label: "Trends" },
  { id: "plots", label: "Plots" },
  { id: "pickorder", label: "Pick Order" },
]

export function CardWidget(input) {
  if (!input.show) {
    return null
  }

  let matchInput = {
    "matchOpts": matchOpts,
    "tagOpts": tagOpts,
  }

  return (
    <div className="analyze-page">
      <SectionNav sections={CARD_SECTIONS} />
      <CardWidgetOptions {...input} {...matchInput} />

      <Section id="stats">
        <h3 className="section-heading">Card Stats</h3>
        <CardWidgetTable {...input} />
      </Section>

      <Section id="trends" heading="Trends">
        <WinrateChart {...input} />
        <PlayRateChart {...input} />
        <ELOChart {...input} />
      </Section>

      <Section id="plots" heading="Plots">
        <CardGraph {...input} />
      </Section>

      <Section id="pickorder" heading="Pick Order">
        <PickOrderSection pickInfo={input.parsed.pickInfo} />
      </Section>
    </div>
  );
}

function colorSort(card) {
  if (card.colors == null || card.colors.length === 0) {
    return "A"
  } else if (card.colors.length > 1) {
    return "A" + card.colors.toString()
  }
  return card.colors.toString()
}

function sortValue(sortBy, card) {
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

// cardNameCell renders the clickable card name with a "played by" popover.
function cardNameCell(card, input, key) {
  return (
    <OverlayTrigger key={key} placement="right" delay={{ show: 500, hide: 100 }}
      overlay={
        <Popover id="popover-basic" style={{ maxWidth: 'none' }}>
          <Popover.Header as="h3">Played by</Popover.Header>
          <Popover.Body>{CardMainboardTooltipContent(card)}</Popover.Body>
        </Popover>
      }>
      <td id={card.name} onClick={input.onCardSelected}>
        <a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a>
      </td>
    </OverlayTrigger>
  )
}

// valueCell is a plain clickable value cell that focuses the card on click.
function valueCell(card, input, key, value) {
  return <td key={key} id={card.name} onClick={input.onCardSelected}>{value}</td>
}

// popoverValueCell is a clickable value cell with an on-hover detail popover.
function popoverValueCell(card, input, key, value, title, body) {
  return (
    <OverlayTrigger key={key} placement="top" delay={{ show: 150, hide: 100 }}
      overlay={
        <Popover id="popover-basic">
          <Popover.Header as="h3">{title}</Popover.Header>
          <Popover.Body>{body}</Popover.Body>
        </Popover>
      }>
      <td id={card.name} onClick={input.onCardSelected}>{value}</td>
    </OverlayTrigger>
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

// winPctCell shows win rate, with the full record detail on hover.
function winPctCell(card, input, key) {
  const body = popoverTable([
    ["Record", `${card.wins}-${card.losses}-${card.draws}`],
    ["Trophies (3-0)", card.trophies],
    ["Last place (0-3)", card.last_place],
    ["% of all wins", `${card.percent_of_wins.toFixed(0)}%`],
  ])
  return popoverValueCell(card, input, key, `${card.win_percent.toFixed(0)}%`, "Win detail", body)
}

// deltaExpCell shows Win% minus expected Win%, coloured. Blank when there's no
// expected win % (too few games to establish a baseline).
function deltaExpCell(card, input, key) {
  if (!card.expected_win_percent) {
    return <td key={key} id={card.name} onClick={input.onCardSelected} style={{ color: "var(--text-muted)" }}>—</td>
  }
  const d = Math.round(card.win_percent - card.expected_win_percent)
  const color = d >= 0 ? "rgb(120, 200, 120)" : "rgb(220, 120, 120)"
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
  id: "games", text: "# Games", tip: "Number of games played by decks that included this card.",
  cell: (c, i, k) => valueCell(c, i, k, c.total_games),
}

const OVERVIEW_COLUMNS = [
  colorsColumn,
  cardColumn,
  { id: "mainboarded", text: "Deck%", tip: "Percentage of drafts this card is mainboarded. Hover for exact board counts.", cell: deckPctCell },
  { id: "wins", text: "Win%", tip: "Win rate of decks that mainboard this card. Hover for record detail.", cell: winPctCell },
  { id: "delta_exp", text: "Δ Exp", tip: "Win% minus expected win% - how the card over/underperforms relative to the players who ran it.", cell: deltaExpCell },
  { id: "elo", text: "Pick ELO", tip: "An ELO ranking based on card pick order in packs.", cell: (c, i, k) => valueCell(c, i, k, c.elo) },
  { id: "match_elo", text: "Match ELO", tip: "An ELO ranking computed from match results, weighted by opponent strength.", cell: (c, i, k) => valueCell(c, i, k, c.match_elo) },
  { id: "lastPlayed", text: "Last played", tip: "Date of the draft this card was last mainboarded.", cell: (c, i, k) => valueCell(c, i, k, c.last_mainboarded) },
]

const METADATA_COLUMNS = [
  colorsColumn,
  cardColumn,
  { id: "wordcount", text: "Words", tip: "Words in the card's oracle text, excluding reminder text.", cell: (c, i, k) => valueCell(c, i, k, c.word_count) },
  { id: "labels", text: "# Labels", tip: "Number of unique archetype labels that have mainboarded this card.", cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.archetypes).length) },
  gamesColumn,
  { id: "players", text: "# Players", tip: "Number of unique players who have mainboarded this card.", cell: (c, i, k) => valueCell(c, i, k, Object.entries(c.players).length) },
]

const VS_ARCH_COLUMNS = [
  colorsColumn, cardColumn, gamesColumn,
  { id: "vsaggro", text: "vs Aggro", tip: "Win rate when this card's deck plays against aggro archetypes.", cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.aggro.win_percent.toFixed(0)}%`) },
  { id: "vscontrol", text: "vs Control", tip: "Win rate when this card's deck plays against control archetypes.", cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.control.win_percent.toFixed(0)}%`) },
  { id: "vsmidrange", text: "vs Midrange", tip: "Win rate when this card's deck plays against midrange archetypes.", cell: (c, i, k) => valueCell(c, i, k, `${c.against_archetype.midrange.win_percent.toFixed(0)}%`) },
]

const BY_ARCH_COLUMNS = [
  colorsColumn, cardColumn, gamesColumn,
  { id: "inaggro", text: "in Aggro", tip: "Win rate of this card when played in aggro decks.", cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.aggro.win_percent.toFixed(0)}%`) },
  { id: "incontrol", text: "in Control", tip: "Win rate of this card when played in control decks.", cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.control.win_percent.toFixed(0)}%`) },
  { id: "inmidrange", text: "in Midrange", tip: "Win rate of this card when played in midrange decks.", cell: (c, i, k) => valueCell(c, i, k, `${c.by_archetype.midrange.win_percent.toFixed(0)}%`) },
]

// CardStatsTable renders a list of column descriptors over the card list.
function CardStatsTable(cards, columns, input) {
  return (
    <div className="table-scroll">
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            {columns.map(function (hdr, i) {
              return (
                <OverlayTrigger key={i} placement="top" delay={{ show: 100, hide: 100 }}
                  overlay={
                    <Popover id="popover-basic">
                      <Popover.Header as="h3">{hdr.text}</Popover.Header>
                      <Popover.Body>{hdr.tip}</Popover.Body>
                    </Popover>
                  }>
                  <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">
                    {hdr.text}{input.sortBy === hdr.id ? (input.sortInvert ? " ▲" : " ▼") : ""}
                  </td>
                </OverlayTrigger>
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

function CardWidgetTable(input) {
  let cards = []
  for (let [name, card] of input.cardData) {
    cards.push(card)
  }
  switch (input.dropdownSelection) {
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

function CardWidgetOptions(input) {
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

        <DropdownHeader
          label="Stats type"
          options={input.cardWidgetOpts}
          value={input.dropdownSelection}
          onChange={input.onSelected}
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

        <DropdownHeader
          label="Color"
          options={input.colorWidgetOpts}
          value={input.colorSelection}
          onChange={input.onColorSelected}
        />

        <NumericInput
          label="Min drafts"
          value={input.minDrafts}
          onChange={input.onMinDraftsSelected}
        />

        <NumericInput
          label="Min games"
          value={input.minGames}
          onChange={input.onMinGamesSelected}
        />
      </div>
    </div>
  );
}

function CardMainboardTooltipContent(card) {
  let mainboarders = []
  let players = Object.entries(card.players)
  for (let [name, num] of players) {
    mainboarders.push({name: name, mb: num, sb: 0})
  }
  let sideboarders = Object.entries(card.sideboarders)
  for (let [name, num] of sideboarders) {
    // Check if an entry exists for this name.
    let found = false
    for (let entry of mainboarders) {
      if (name === entry.name) {
        entry.sb = num
        found = true
      }
    }
    if (!found) {
      // Add a new entry.
      mainboarders.push({name: name, mb: 0, sb: num})
    }
  }

  // Archetype labels this card has been mainboarded in, sorted by count.
  let labels = Object.entries(card.archetypes || {})
    .map(([name, num]) => ({name: name, num: num}))
    .sort((a, b) => b.num - a.num)

  return (
    <div style={{"display": "flex", "flexDirection": "row", "gap": "12px", "alignItems": "flex-start"}}>
      <img
        src={CardImageURL(card)}
        alt={card.name}
        style={{width: '200px', display: 'block', borderRadius: '8px', flexShrink: 0}}
      />
      <table style={{"borderCollapse": "collapse", "fontSize": "0.85rem", "width": "100%"}}>
        <thead>
          <tr style={{"borderBottom": "2px solid var(--border)", "textAlign": "left", "color": "var(--text-muted)"}}>
            <th style={{"padding": "4px 8px"}}>Player</th>
            <th style={{"padding": "4px 8px", "textAlign": "center"}}># MB</th>
            <th style={{"padding": "4px 8px", "textAlign": "center"}}># SB</th>
          </tr>
        </thead>
        <tbody>
        {
          mainboarders.map(function(row) {
            return (
              <tr sort={row.num} key={row.name} style={{"borderBottom": "1px solid var(--border)"}}>
                <td style={{"padding": "4px 8px", "whiteSpace": "nowrap"}}>{row.name}</td>
                <td style={{"padding": "4px 8px", "textAlign": "center"}}>{row.mb}</td>
                <td style={{"padding": "4px 8px", "textAlign": "center"}}>{row.sb}</td>
              </tr>
            );
          }).sort(SortFunc)
        }
        </tbody>
      </table>
      <table style={{"borderCollapse": "collapse", "fontSize": "0.85rem", "width": "100%"}}>
        <thead>
          <tr style={{"borderBottom": "2px solid var(--border)", "textAlign": "left", "color": "var(--text-muted)"}}>
            <th style={{"padding": "4px 8px"}}>Archetype</th>
            <th style={{"padding": "4px 8px", "textAlign": "center"}}># MB</th>
          </tr>
        </thead>
        <tbody>
        {
          labels.map(function(row) {
            return (
              <tr key={row.name} style={{"borderBottom": "1px solid var(--border)"}}>
                <td style={{"padding": "4px 8px", "whiteSpace": "nowrap"}}>{row.name}</td>
                <td style={{"padding": "4px 8px", "textAlign": "center"}}>{row.num}</td>
              </tr>
            );
          })
        }
        </tbody>
      </table>
    </div>
  );
}

function PlayRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.cardDataBucketed

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  let name = input.selectedCard
  if (name == "") {
    return <p className="section-hint">Select a card to chart its play rate over time.</p>
  }

  var mb = []
  var sb = []
  var playableSb = []
  for (let bucket of buckets) {
    let data = new Map(Object.entries(bucket.data))
    let stats = data.get(name)
    if (stats != null) {
      mb.push(stats.mainboard_percent)
      sb.push(stats.sideboard_percent)
      playableSb.push(stats.playable_sideboard_percent)
    } else {
      // Player was not in this bucket.
      mb.push(null)
      sb.push(null)
      playableSb.push(null)
    }
  }

  let dataset = [
      {
        label: 'Mainboard %',
        data: mb,
        borderColor: "#0F0",
        backgroundColor: "#0F0",
      },
      {
        label: 'Sideboard %',
        data: sb,
        borderColor: "#FF0",
        backgroundColor: "#FF0",
      },
      {
        label: 'Playable sb %',
        data: playableSb,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
  ]


  let title = `${name} % (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: ticks,
        title: {display: true, text: "Pick %", font: {size: 20, weight: "bold"}, color: "white"},
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}, color: "white"},
        ticks: bucketTicks,
      },
    },
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container" align="center">
      <div align="center" style={{"height": chartHeight, "width": "100%"}}>
        <Line className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

function ELOChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.cardDataBucketed

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  let name = input.selectedCard
  if (name == "") {
    return <p className="section-hint">Select a card to chart its ELO over time.</p>
  }

  let min = 850
  let max = 1450

  var elo = []
  for (let bucket of buckets) {
    let data = new Map(Object.entries(bucket.data))
    let stats = data.get(name)
    if (stats != null) {
      if (stats.elo > max) {
        max = stats.elo
      }
      if (stats.elo < min) {
        min = stats.elo
      }
      elo.push(stats.elo)
    } else {
      // Player was not in this bucket.
      elo.push(null)
    }
  }

  let dataset = [
      {
        label: 'ELO',
        data: elo,
        borderColor: "#F0F",
        backgroundColor: "#F0F",
      },
  ]


  let title = `${name} ELO (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        title: {display: true, text: "Pick ELO", font: {size: 20, weight: "bold"}, color: "white"},
        min: min-50,
        max: max+50,
        ticks: ticks,
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}, color: "white"},
        ticks: bucketTicks,
      },
    },
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container" align="center">
      <div align="center" style={{"height": chartHeight, "width": "100%"}}>
        <Line className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

function WinrateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.cardDataBucketed

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  let name = input.selectedCard
  if (name == "") {
    return <p className="section-hint">Select a card to chart its win rate over time.</p>
  }

  var wins = []
  var pows = []
  for (let bucket of buckets) {
    let data = new Map(Object.entries(bucket.data))
    let card = data.get(name)
    if (card != null && card.mainboard_percent > 0) {
      wins.push(card.win_percent)

      // Determine % of wins that involved this card from within this bucket.
      // This is the total number of wins with this card, divided by the total number of
      // wins in the bucket.
      pows.push(100 * card.wins / bucket.games)
    } else {
      // Card was not in this bucket.
      wins.push(null)
      pows.push(null)
    }
  }

  let dataset = [
      {
        label: 'Win %',
        data: wins,
        borderColor: "#0F0",
        backgroundColor: "#0F0",
      },
      {
        label: '% of all Wins',
        data: pows,
        borderColor: "#FF0",
        backgroundColor: "#FF0",
      },
  ]

  let title = `${name} win % (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        title: {display: true, text: "Win %", font: {size: 20, weight: "bold"}, color: "white"},
        min: 0,
        max: 100,
        ticks: ticks,
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}, color: "white"},
        ticks: bucketTicks,
      },
    },
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container" align="center">
      <div align="center" style={{"height": chartHeight, "width": "100%"}}>
        <Line className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

function CardGraph(input) {

  // Determine what to show on each axis.
  let xAxis = input.xAxis
  let yAxis = input.yAxis

  // Labels for each data point.
  var labels = []
  var backgroundColors = []
  var sizes = []

  let name = yAxis + " vs. " + xAxis

  // Track the plotted range so we can span a baseline line across the whole axis.
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
  let track = function(v, isX) {
    if (v == null || !isFinite(v)) {
      return
    }
    if (isX) {
      xMin = Math.min(xMin, v); xMax = Math.max(xMax, v)
    } else {
      yMin = Math.min(yMin, v); yMax = Math.max(yMax, v)
    }
  }

  // values is an array of maps with keys 'x' and 'y'.
  var values = []
  for (let [name, card] of input.cardData) {
    var x = null
    var y = null

    if (shouldSkip(card, input)) {
      continue
    }

    x = getValue(xAxis, card, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)
    y = getValue(yAxis, card, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)
    track(x, true)
    track(y, false)

    labels.push(card.name)

    // Color every point by whether the card is a net positive or net negative
    // relative to the cube average (green over 50%, red under). Cards with no games
    // have no meaningful win rate, so they stay neutral grey. The selected card is
    // highlighted white so it stands out from the red/green field.
    let games = card.total_games || 0
    if (card.name === input.selectedCard) {
      backgroundColors.push("#FFF")
      sizes.push(10)
    } else if (games <= 0) {
      backgroundColors.push("#b0b0b0")
      sizes.push(3)
    } else {
      backgroundColors.push(card.win_percent >= CUBE_AVG_WIN_PERCENT ? deltaPositiveFill : deltaNegativeFill)
      sizes.push(3)
    }
    values.push({"x": x, "y": y})
  }

  let dataset = [
      {
        label: "All cards",
        data: values,
        pointBackgroundColor: backgroundColors,
        pointRadius: sizes,
        pointHoverRadius: 10,
      },
  ]

  // When an axis shows the win-rate delta, draw a dashed cube-average baseline at
  // zero so over/underperformers read at a glance.
  if (yAxis === WinPercentVsAvgOption && isFinite(xMin) && isFinite(xMax)) {
    dataset.push({
      type: "line",
      label: "Cube average",
      data: [{x: xMin, y: 0}, {x: xMax, y: 0}],
      borderColor: "#888",
      borderDash: [6, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
    })
  }
  if (xAxis === WinPercentVsAvgOption && isFinite(yMin) && isFinite(yMax)) {
    dataset.push({
      type: "line",
      label: "Cube average",
      data: [{x: 0, y: yMin}, {x: 0, y: yMax}],
      borderColor: "#888",
      borderDash: [6, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
    })
  }

  let title = `${name} (all drafts)`

  // Signed-percent ticks for the win-delta axis, plain ticks otherwise.
  let axisTicks = function(axis) {
    if (axis === WinPercentVsAvgOption) {
      return {...ticks, callback: (v) => (v > 0 ? "+" : "") + v + "%"}
    }
    return ticks
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: function(evt, element) {},
    scales: {
      y: {
        title: {display: true, text: yAxis, font: {size: 20, weight: "bold"}, color: "white"},
        min: getScales(yAxis, false)[0],
        max: getScales(yAxis, false)[1],
        ticks: axisTicks(yAxis),
      },
      x: {
        title: {display: true, text: xAxis, font: {size: 20, weight: "bold"}, color: "white"},
        min: getScales(xAxis, false)[0],
        max: getScales(xAxis, false)[1],
        ticks: axisTicks(xAxis),
      },
    },
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            if (ctx.datasetIndex !== 0) {
              return ""
            }
            let fmt = function(axis, v) {
              if (v == null) {
                return "—"
              }
              if (axis === WinPercentVsAvgOption) {
                return (v > 0 ? "+" : "") + v.toFixed(1) + "%"
              }
              return v
            }
            return `${labels[ctx.dataIndex]}: ${xAxis} ${fmt(xAxis, ctx.parsed.x)}, ${yAxis} ${fmt(yAxis, ctx.parsed.y)}`
          },
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container">
      <div className="selector-group" style={{"justifyContent": "center", "marginBottom": "1rem"}}>
        <DropdownHeader
          label="X Axis"
          options={CardScatterAxes}
          value={input.xAxis}
          onChange={input.onXAxisSelected}
        />
        <DropdownHeader
          label="Y Axis"
          options={CardScatterAxes}
          value={input.yAxis}
          onChange={input.onYAxisSelected}
        />
      </div>

      <div align="center" style={{"height": "800px", "width": "100%"}}>
        <Scatter className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

// reputationColor maps a card's color identity to a point color: its mana color
// for mono, gold for multicolor, grey for colorless.
function reputationColor(identity) {
  if (!identity || identity.length === 0) {
    return "#b0b0b0"
  }
  if (identity.length === 1) {
    return Colors.get(identity[0]) || "#b0b0b0"
  }
  return "#d4af37"
}

function getScales(axis, force) {
  if (force) {
    switch (axis) {
      case MainboardPercentOption:
      case SideboardPercentOption:
      case WinPercentOption:
      case ExpectedWinPercentOption:
        return [0, 100]
    }
  }
  return [null, null]
}

function getValue(axis, card, archetypeData, playerData, decks, draftData) {
  switch (axis) {
    case NumGamesOption:
      return card.total_games
    case MainboardPercentOption:
      return card.mainboard_percent
    case SideboardPercentOption:
      return card.sideboard_percent
    case ELOOption:
      return card.elo
    case MatchELOOption:
      return card.match_elo
    case WinPercentOption:
      return card.win_percent
    case WinPercentVsAvgOption:
      // Win rate relative to the cube-wide average. Only meaningful once the card
      // has played games; unplayed cards return null so they drop off the axis.
      if (!card.total_games || card.total_games <= 0) {
        return null
      }
      return card.win_percent - CUBE_AVG_WIN_PERCENT
    case PercentOfWinsOption:
      return card.percent_of_wins
    case NumberOfWinsOption:
      return card.wins
    case NumDecksOption:
      return card.mainboard
    case NumSideboardOption:
      return card.sideboard
    case ManaValueOption:
      return card.cmc
    case NumPlayersOption:
      return Object.entries(card.players).length
    case ExpectedWinPercentOption:
      return card.expected_win_percent
    case NumTrophiesOption:
      return card.trophies
    case NumLastPlaceOption:
      return card.last_place
    case DraftOrderOption:
      let pick = draftData.get(card.name)
      if (pick == null) {
        return null
      }
      return Math.round(pick.pickNumSum / pick.count * 10) / 10
    case VersusAggroOption:
      return card.against_archetype.aggro.win_percent
    case VersusMidrangeOption:
      return card.against_archetype.midrange.win_percent
    case VersusControlOption:
      return card.against_archetype.control.win_percent
    case InAggroOption:
      return card.by_archetype.aggro.win_percent
    case InMidrangeOption:
      return card.by_archetype.midrange.win_percent
    case InControlOption:
      return card.by_archetype.control.win_percent
    case WordCountOption:
      return card.word_count
  }
  return null
}

// PickOrderSection shows per-card draft pick statistics aggregated across all
// drafts (how early each card tends to be taken, how often it's first-picked,
// how often it's burned). It holds its own sort and filter state so it doesn't
// depend on the Browse Drafts page where this table used to live.
function PickOrderSection({ pickInfo }) {
  const [sortBy, setSortBy] = React.useState("p1p1");
  const [invertSort, setInvertSort] = React.useState(false);
  const [minDrafts, setMinDrafts] = React.useState(0);
  const [minDeviation, setMinDeviation] = React.useState(0);
  const [maxDeviation, setMaxDeviation] = React.useState(0);
  const [minAvgPick, setMinAvgPick] = React.useState(0);
  const [maxAvgPick, setMaxAvgPick] = React.useState(0);

  const onHeaderClick = (e) => {
    const id = e.currentTarget.id;
    if (sortBy === id) {
      setInvertSort(!invertSort);
    } else {
      setInvertSort(false);
      setSortBy(id);
    }
  };

  let pickList = [];
  for (let [, pick] of (pickInfo || new Map())) {
    pickList.push(pick);
  }

  let headers = [
    { id: "name", text: "Card name", tip: "The card's name." },
    { id: "count", text: "# Drafts", tip: "Number of drafts that have included this card." },
    { id: "p1p1", text: "# P1P1", tip: "Number of times this card has been selected pick 1 of pack 1." },
    { id: "avgp1pick", text: "Avg. p1 pick", tip: "Average pick, limited exclusively to instances where this card was present in pack #1." },
    { id: "avgpick", text: "Avg. pick", tip: "Average pick for this card within a pack (i.e., out of 15)." },
    { id: "avgpickabs", text: "Avg. pick (abs)", tip: "Average pick for this card across all packs (i.e., out of 45). Mostly silly, but fun to look at." },
    { id: "stddev", text: "Pick deviation", tip: "Pick order standard deviation. A higher number means this card has a higher variance in pick order." },
    { id: "p1burn", text: "# P1 Burns", tip: "For drafts that burn cards, the number of times this card was burned in pack #1." },
    { id: "burn", text: "# Burns", tip: "For drafts that burn cards, the number of times that this card was burned in total." },
  ];

  return (
    <div className="controls-panel">
      <div className="selector-group" style={{ justifyContent: "center" }}>
        <NumericInput label="Min dev" value={minDeviation} onChange={(e) => setMinDeviation(e.target.value)} />
        <NumericInput label="Max dev" value={maxDeviation} onChange={(e) => setMaxDeviation(e.target.value)} />
        <NumericInput label="Min drafts" value={minDrafts} onChange={(e) => setMinDrafts(e.target.value)} />
        <NumericInput label="Min avg" value={minAvgPick} onChange={(e) => setMinAvgPick(e.target.value)} />
        <NumericInput label="Max avg" value={maxAvgPick} onChange={(e) => setMaxAvgPick(e.target.value)} />
      </div>
      <div className="table-scroll" style={{ marginTop: "1rem" }}>
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              {headers.map((hdr) => (
                <OverlayTrigger
                  key={hdr.id}
                  placement="top"
                  delay={{ show: 100, hide: 100 }}
                  overlay={
                    <Popover id="popover-basic">
                      <Popover.Header as="h3">{hdr.text}</Popover.Header>
                      <Popover.Body>{hdr.tip}</Popover.Body>
                    </Popover>
                  }
                >
                  <td onClick={onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                </OverlayTrigger>
              ))}
            </tr>
          </thead>
          <tbody>
            {pickList.map(function (pick) {
              if (minDrafts > 0 && pick.count < minDrafts) {
                return
              }

              let avgPackPick = "-"
              let avgPackPickAbsolute = "-"
              if (pick.count > 0) {
                avgPackPick = Math.round(pick.pickNumSum / pick.count * 10) / 10
                avgPackPickAbsolute = Math.round(pick.pickNumSumAbs / pick.count * 10) / 10
              }

              if (minAvgPick > 0 && avgPackPick < minAvgPick) {
                return
              }
              if (maxAvgPick > 0 && avgPackPick > maxAvgPick) {
                return
              }

              let avgPack1Pick = "-"
              if (pick.p1Count > 0) {
                avgPack1Pick = Math.round(pick.p1PickNumSum / pick.p1Count * 100) / 100
              }

              let firstPicks = "-"
              if (pick.firstPicks > 0) {
                firstPicks = pick.firstPicks
              }

              let burns = "-"
              if (pick.burns > 0) {
                burns = pick.burns
              }

              let p1Burns = "-"
              if (pick.p1Burns > 0) {
                p1Burns = pick.p1Burns
              }

              let sumOfSquares = 0
              for (let p of pick.picks) {
                let diff = avgPackPick - p.pick
                sumOfSquares += diff * diff
              }
              let stddev = pick.count < 2 ? 0 : Math.round(Math.sqrt(sumOfSquares / (pick.count - 1)) * 10) / 10

              if (minDeviation > 0 && stddev < minDeviation) {
                return
              }
              if (maxDeviation > 0 && stddev > maxDeviation) {
                return
              }

              // Sort uses raw numeric data, not display strings. null means
              // "no data" and is translated to an end-of-list sentinel below.
              let sort = pick.count
              if (sortBy === "p1p1") {
                sort = pick.firstPicks
              } else if (sortBy === "avgp1pick") {
                sort = pick.p1Count > 0 ? pick.p1PickNumSum / pick.p1Count : null
              } else if (sortBy === "avgpick") {
                sort = pick.count > 0 ? pick.pickNumSum / pick.count : null
              } else if (sortBy === "avgpickabs") {
                sort = pick.count > 0 ? pick.pickNumSumAbs / pick.count : null
              } else if (sortBy === "burn") {
                sort = pick.burns
              } else if (sortBy === "p1burn") {
                sort = pick.p1Burns
              } else if (sortBy === "name") {
                sort = pick.name
              } else if (sortBy === "count") {
                sort = pick.count
              } else if (sortBy === "stddev") {
                sort = stddev
              }

              if (sort === null) {
                sort = invertSort ? 100000 : -1
              } else if (invertSort && typeof sort === "number") {
                sort = -1 * sort
              }

              return (
                <tr sort={sort} className="widget-table-row" key={pick.name}>
                  <OverlayTrigger
                    placement="right"
                    delay={{ show: 500, hide: 100 }}
                    overlay={
                      <Popover id="popover-basic" style={{ maxWidth: 'none' }}>
                        <Popover.Header as="h3">{pick.name}</Popover.Header>
                        <Popover.Body>{PickOrderTooltip(pick)}</Popover.Body>
                      </Popover>
                    }
                  >
                    <td><a href={pick.card.url} target="_blank" rel="noopener noreferrer">{pick.name}</a></td>
                  </OverlayTrigger>
                  <td>{pick.count}</td>
                  <td>{firstPicks}</td>
                  <td>{avgPack1Pick}</td>
                  <td>{avgPackPick}</td>
                  <td>{avgPackPickAbsolute}</td>
                  <td>{stddev}</td>
                  <td>{p1Burns}</td>
                  <td>{burns}</td>
                </tr>
              )
            }).sort(SortFunc)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// PickOrderTooltip lists every individual pick of a card across drafts.
function PickOrderTooltip(pick) {
  let k = 0
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "12px", alignItems: "flex-start" }}>
      <img
        src={CardImageURL(pick)}
        alt={pick.name}
        style={{ width: '200px', display: 'block', borderRadius: '8px', flexShrink: 0 }}
      />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
            <th style={{ padding: "4px 8px" }}>Date</th>
            <th style={{ padding: "4px 8px" }}>Player</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>Pack</th>
            <th style={{ padding: "4px 8px", textAlign: "center" }}>Pick</th>
          </tr>
        </thead>
        <tbody>
          {pick.picks.map(function (p) {
            k += 1
            return (
              <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "4px 8px" }}>{p.date}</td>
                <td style={{ padding: "4px 8px" }}>{p.player}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{p.pack + 1}</td>
                <td style={{ padding: "4px 8px", textAlign: "center" }}>{p.pick + 1}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
