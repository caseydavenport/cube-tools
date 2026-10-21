// The Cards scatter plot: how each card's point is placed and colored. The
// axis choices live in scatterAxes.js.

import React from 'react'
import { DropdownHeader } from "../../components/Dropdown.js"
import { availableValue, hasData, visibleItems } from "../../utils/dataKinds.js"
import { CUBE_AVG_WIN_PERCENT } from "../../utils/Colors.js"
import { largeTicks } from "../../utils/Buckets.js"
import { Scatter } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, deltaFill, seriesColor } from "../../theme/chartTheme.js"
import { shouldSkip } from "./CardStatsTable.js"
import { CARDS_COPY } from "./copy.js"
import { CardAxis, CardScatterAxes, axisLabel } from "../scatterAxes.js"

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
        label: CARDS_COPY.scatter.allCardsLabel,
        data: values,
        // A function, so Chart.js colors the points again when the scheme changes.
        pointBackgroundColor: ctx => scatterPointColor(pointKinds[ctx.dataIndex]),
        pointRadius: sizes,
        pointHoverRadius: 10,
      },
  ]

  // When an axis shows the win-rate delta, draw a dashed cube-average baseline at
  // zero so over/underperformers read at a glance.
  if (yAxis === CardAxis.winPercentVsAvg && isFinite(xMin) && isFinite(xMax)) {
    dataset.push({
      type: "line",
      label: CARDS_COPY.scatter.cubeAverageLabel,
      data: [{x: xMin, y: 0}, {x: xMax, y: 0}],
      borderColor: () => currentChartTheme().muted,
      borderDash: [6, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
    })
  }
  if (xAxis === CardAxis.winPercentVsAvg && isFinite(yMin) && isFinite(yMax)) {
    dataset.push({
      type: "line",
      label: CARDS_COPY.scatter.cubeAverageLabel,
      data: [{x: 0, y: yMin}, {x: 0, y: yMax}],
      borderColor: () => currentChartTheme().muted,
      borderDash: [6, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
    })
  }

  let title = CARDS_COPY.scatter.title({ y: axisLabel(CardScatterAxes, yAxis), x: axisLabel(CardScatterAxes, xAxis) })

  // Signed-percent ticks for the win-delta axis, plain ticks otherwise.
  let axisTicks = function(axis) {
    if (axis === CardAxis.winPercentVsAvg) {
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
        title: {display: true, text: axisLabel(CardScatterAxes, yAxis), font: {size: 20, weight: "bold"}},
        min: getScales(yAxis, false)[0],
        max: getScales(yAxis, false)[1],
        ticks: axisTicks(yAxis),
      },
      x: {
        title: {display: true, text: axisLabel(CardScatterAxes, xAxis), font: {size: 20, weight: "bold"}},
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
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: {
          label: function(ctx) {
            if (ctx.datasetIndex !== 0) {
              return ""
            }
            let fmt = function(axis, v) {
              if (v == null) {
                return "—"
              }
              if (axis === CardAxis.winPercentVsAvg) {
                return (v > 0 ? "+" : "") + v.toFixed(1) + "%"
              }
              return v
            }
            return CARDS_COPY.scatter.pointLabel({
              card: labels[ctx.dataIndex],
              x: axisLabel(CardScatterAxes, xAxis),
              xValue: fmt(xAxis, ctx.parsed.x),
              y: axisLabel(CardScatterAxes, yAxis),
              yValue: fmt(yAxis, ctx.parsed.y),
            })
          },
        },
      }),
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
          label={CARDS_COPY.scatter.xAxisLabel}
          options={visibleItems(CardScatterAxes, input.info)}
          value={xAxis}
          onChange={input.onXAxisSelected}
        />
        <DropdownHeader
          label={CARDS_COPY.scatter.yAxisLabel}
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
      case CardAxis.mainboardPercent:
      case CardAxis.sideboardPercent:
      case CardAxis.winPercent:
      case CardAxis.expectedWinPercent:
        return [0, 100]
    }
  }
  return [null, null]
}

function getValue(axis, card, archetypeData, playerData, decks, draftData) {
  switch (axis) {
    case CardAxis.numGames:
      return card.total_games
    case CardAxis.mainboardPercent:
      return card.mainboard_percent
    case CardAxis.sideboardPercent:
      return card.sideboard_percent
    case CardAxis.pickElo:
      return card.elo
    case CardAxis.matchElo:
      return card.match_elo
    case CardAxis.winPercent:
      return card.win_percent
    case CardAxis.winPercentVsAvg:
      // Win rate relative to the cube-wide average. Only meaningful once the card
      // has played games; unplayed cards return null so they drop off the axis.
      if (!card.total_games || card.total_games <= 0) {
        return null
      }
      return card.win_percent - CUBE_AVG_WIN_PERCENT
    case CardAxis.percentOfWins:
      return card.percent_of_wins
    case CardAxis.numWins:
      return card.wins
    case CardAxis.numDecks:
      return card.mainboard
    case CardAxis.numSideboard:
      return card.sideboard
    case CardAxis.manaValue:
      return card.cmc
    case CardAxis.numPlayers:
      return Object.entries(card.players).length
    case CardAxis.expectedWinPercent:
      return card.expected_win_percent
    case CardAxis.numTrophies:
      return card.trophies
    case CardAxis.numLastPlace:
      return card.last_place
    case CardAxis.draftPick:
      let pick = draftData.get(card.name)
      if (pick == null) {
        return null
      }
      return Math.round(pick.pickNumSum / pick.count * 10) / 10
    case CardAxis.vsAggro:
      return card.against_archetype.aggro.win_percent
    case CardAxis.vsMidrange:
      return card.against_archetype.midrange.win_percent
    case CardAxis.vsControl:
      return card.against_archetype.control.win_percent
    case CardAxis.inAggro:
      return card.by_archetype.aggro.win_percent
    case CardAxis.inMidrange:
      return card.by_archetype.midrange.win_percent
    case CardAxis.inControl:
      return card.by_archetype.control.win_percent
    case CardAxis.wordCount:
      return card.word_count
  }
  return null
}
