// The Cards scatter plot: the axis choices and how each card's point is
// placed and colored.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { availableValue, hasData, visibleItems } from "../../utils/dataKinds.js"
import { CUBE_AVG_WIN_PERCENT } from "../../utils/Colors.js"
import { largeTicks } from "../../utils/Buckets.js"
import { Scatter } from 'react-chartjs-2'
import { currentChartTheme, deltaFill, seriesColor } from "../../theme/chartTheme.js"
import { shouldSkip } from "./CardStatsTable.js"

// Chart configuration.
const NumDecksOption = "# Decks"

const NumSideboardOption = "# Sideboard"

const MainboardPercentOption = "Mainboard %"

const SideboardPercentOption = "Sideboard %"

const WinPercentOption = "Win %"

const WinPercentVsAvgOption = "Win % vs avg"

const PercentOfWinsOption = "% of Wins"

const NumberOfWinsOption = "# Wins"

const ExpectedWinPercentOption = "Expected Win %"

const ELOOption = "Pick ELO"

const MatchELOOption = "Match ELO"

const NumGamesOption = "# Games"

const ManaValueOption = "Mana Value"

const NumPlayersOption = "# Players"

const DraftOrderOption = "Avg. draft pick"

const NumTrophiesOption = "# Trophies"

const NumLastPlaceOption = "# Last place"

const VersusAggroOption = "vs Aggro Win %"

const VersusControlOption = "vs Control Win %"

const VersusMidrangeOption = "vs Midrange Win %"

const InAggroOption = "in Aggro Win %"

const InControlOption = "in Control Win %"

const InMidrangeOption = "in Midrange Win %"

const WordCountOption = "Word Count"

// CardScatterAxes are the measures the scatter plot can put on an axis. needs
// lists the data a measure is built from, so a cube without it doesn't offer it.
const CardScatterAxes = [
  {label: NumDecksOption, value: NumDecksOption},
  {label: NumSideboardOption, value: NumSideboardOption, needs: ["sideboards"]},
  {label: MainboardPercentOption, value: MainboardPercentOption, needs: ["sideboards"]},
  {label: SideboardPercentOption, value: SideboardPercentOption, needs: ["sideboards"]},
  {label: WinPercentOption, value: WinPercentOption, needs: ["results"]},
  {label: WinPercentVsAvgOption, value: WinPercentVsAvgOption, needs: ["results"]},
  {label: PercentOfWinsOption, value: PercentOfWinsOption, needs: ["results"]},
  {label: NumberOfWinsOption, value: NumberOfWinsOption, needs: ["results"]},
  {label: ExpectedWinPercentOption, value: ExpectedWinPercentOption, needs: ["results"]},
  {label: ELOOption, value: ELOOption, needs: ["sideboards"]},
  {label: MatchELOOption, value: MatchELOOption, needs: ["results"]},
  {label: NumGamesOption, value: NumGamesOption, needs: ["results"]},
  {label: ManaValueOption, value: ManaValueOption},
  {label: NumPlayersOption, value: NumPlayersOption},
  {label: DraftOrderOption, value: DraftOrderOption, needs: ["pick_logs"]},
  {label: NumTrophiesOption, value: NumTrophiesOption, needs: ["results"]},
  {label: NumLastPlaceOption, value: NumLastPlaceOption, needs: ["results"]},
  {label: VersusAggroOption, value: VersusAggroOption, needs: ["results", "archetypes"]},
  {label: VersusControlOption, value: VersusControlOption, needs: ["results", "archetypes"]},
  {label: VersusMidrangeOption, value: VersusMidrangeOption, needs: ["results", "archetypes"]},
  {label: InAggroOption, value: InAggroOption, needs: ["results", "archetypes"]},
  {label: InControlOption, value: InControlOption, needs: ["results", "archetypes"]},
  {label: InMidrangeOption, value: InMidrangeOption, needs: ["results", "archetypes"]},
  {label: WordCountOption, value: WordCountOption},
]

// scatterPointColor colors one card on the scatter plot from its kind: the
// selected card in the text color, a card with no games muted, every card the
// same color on a cube without results, and otherwise good or bad by how far
// its win rate sits from the cube average.
function scatterPointColor(kind) {
  const theme = currentChartTheme()
  if (kind === "selected") {
    return theme.text
  }
  if (kind === "noGames") {
    return theme.muted
  }
  if (kind === "plain") {
    return seriesColor(0)
  }
  return deltaFill(kind)
}

export function CardGraph(input) {

  // Determine what to show on each axis. A remembered axis the cube can't
  // fill (Pick ELO without sideboards) falls back to one it can.
  let xAxis = availableValue(input.xAxis, CardScatterAxes, input.info)
  let yAxis = availableValue(input.yAxis, CardScatterAxes, input.info, xAxis)

  // Labels for each data point.
  var labels = []
  var pointKinds = []
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
    // drawn in the theme's text color so it stands out from the red/green field.
    let games = card.total_games || 0
    if (card.name === input.selectedCard) {
      pointKinds.push("selected")
      sizes.push(10)
    } else if (games <= 0) {
      pointKinds.push("noGames")
      sizes.push(3)
    } else if (!hasData(input.info, "results")) {
      // Without match results there's no win rate to color by.
      pointKinds.push("plain")
      sizes.push(3)
    } else {
      pointKinds.push(card.win_percent - CUBE_AVG_WIN_PERCENT)
      sizes.push(3)
    }
    values.push({"x": x, "y": y})
  }

  let dataset = [
      {
        label: "All cards",
        data: values,
        // A function, so Chart.js colors the points again when the scheme changes.
        pointBackgroundColor: ctx => scatterPointColor(pointKinds[ctx.dataIndex]),
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
      borderColor: () => currentChartTheme().muted,
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
      borderColor: () => currentChartTheme().muted,
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
      return {...largeTicks, callback: (v) => (v > 0 ? "+" : "") + v + "%"}
    }
    return largeTicks
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: function(evt, element) {},
    scales: {
      y: {
        title: {display: true, text: yAxis, font: {size: 20, weight: "bold"}},
        min: getScales(yAxis, false)[0],
        max: getScales(yAxis, false)[1],
        ticks: axisTicks(yAxis),
      },
      x: {
        title: {display: true, text: xAxis, font: {size: 20, weight: "bold"}},
        min: getScales(xAxis, false)[0],
        max: getScales(xAxis, false)[1],
        ticks: axisTicks(xAxis),
      },
    },
    plugins: {
      title: {
        display: true,
        text: title,
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
          options={visibleItems(CardScatterAxes, input.info)}
          value={xAxis}
          onChange={input.onXAxisSelected}
        />
        <DropdownHeader
          label="Y Axis"
          options={visibleItems(CardScatterAxes, input.info)}
          value={yAxis}
          onChange={input.onYAxisSelected}
        />
      </div>

      <div align="center" className="stats-chart stats-chart-scatter">
        <Scatter className="chart" options={options} data={data} />
      </div>
    </div>
  );
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
