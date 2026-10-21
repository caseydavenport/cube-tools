// The Deck stats scatter plot: how each deck's point is placed and colored.
// The axis choices live in scatterAxes.js.

import React from 'react'
import { AverageCMC, Pct } from "../../utils/Utils.js"
import { Wins, Losses } from "../../utils/Deck.js"
import { largeTicks } from "../../utils/Buckets.js"
import { DropdownHeader } from "../../components/Dropdown.js"
import { Scatter } from 'react-chartjs-2'
import { currentChartTheme, seriesColor } from "../../theme/chartTheme.js"
import { availableValue, visibleItems } from "../../utils/dataKinds.js"
import { DeckSplits } from "../../utils/cardMatches.js"
import { DECKSTATS_COPY } from "./copy.js"
import { DeckAxis, DeckScatterAxes, axisLabel } from "../scatterAxes.js"
import "../stats.css"

// deckPointColor colors one deck on the scatter plot: the selected deck in
// the text color, every other deck in the first series color.
function deckPointColor(kind) {
  if (kind === "selected") {
    return currentChartTheme().text
  }
  return seriesColor(0)
}

export function DeckGraph(input) {

  // Determine what to show on each axis.
  // A remembered axis the cube can't fill (win % without results) falls back
  // to one it can.
  let xAxis = availableValue(input.xAxis, DeckScatterAxes, input.info)
  let yAxis = availableValue(input.yAxis, DeckScatterAxes, input.info, xAxis)

  // Labels for each data point.
  var labels = []
  var pointKinds = []
  var sizes = []

  // values is an array of maps with keys 'x' and 'y'.
  var values = []
  for (let deck of input.parsed.filteredDecks) {
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

    var x = null
    var y = null

    x = getValue(xAxis, deck, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)
    y = getValue(yAxis, deck, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)

    if (x === null || y === null) {
      continue
    }

    let name = deck.player + " (" + deck.date + ")"
    labels.push(name)

    // The selected deck stands out in the text color.
    if (name === input.selectedCard) {
      pointKinds.push("selected")
      sizes.push(10)
    } else {
      pointKinds.push("plain")
      sizes.push(3)
    }
    values.push({"x": x, "y": y})
  }

  let dataset = [
      {
        label: DECKSTATS_COPY.scatter.datasetLabel,
        data: values,
        // A function, so Chart.js colors the points again when the scheme changes.
        pointBackgroundColor: ctx => deckPointColor(pointKinds[ctx.dataIndex]),
        pointRadius: sizes,
        pointHoverRadius: 10,
      },
  ]


  let title = DECKSTATS_COPY.scatter.title(axisLabel(DeckScatterAxes, yAxis), axisLabel(DeckScatterAxes, xAxis))

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: function(evt, element) {},
    scales: {
      y: {
        title: {display: true, text: axisLabel(DeckScatterAxes, yAxis), font: {size: 20, weight: "bold"}},
        min: getScales(yAxis, false)[0],
        max: getScales(yAxis, false)[1],
        ticks: largeTicks,
      },
      x: {
        title: {display: true, text: axisLabel(DeckScatterAxes, xAxis), font: {size: 20, weight: "bold"}},
        min: getScales(xAxis, false)[0],
        max: getScales(xAxis, false)[1],
        ticks: largeTicks,
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
      <div className="selector-group stats-row-centered-spaced">
        <DropdownHeader
          label={DECKSTATS_COPY.scatter.xAxisLabel}
          options={visibleItems(DeckScatterAxes, input.info)}
          value={xAxis}
          onChange={input.onXAxisSelected}
        />
        <DropdownHeader
          label={DECKSTATS_COPY.scatter.yAxisLabel}
          options={visibleItems(DeckScatterAxes, input.info)}
          value={yAxis}
          onChange={input.onYAxisSelected}
        />
      </div>

      <div align="center" className="stats-deck-scatter">
        <Scatter className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

function getScales(axis, force) {
  // TODO: Can uncomment this when there are % based stat options.
  // if (force) {
  //   switch (axis) {
  //     case DeckAxis.interaction:
  //     case DeckAxis.creatures:
  //       return [0, 100]
  //   }
  // }
  return [null, null]
}

function getValue(axis, deck, archetypeData, playerData, decks, draftData) {
  let [creatures, interaction] = DeckSplits(deck)

  switch (axis) {
    case DeckAxis.interaction:
      return interaction
    case DeckAxis.creatures:
      return creatures
    case DeckAxis.winPercent:
      return Pct(Wins(deck), Wins(deck) + Losses(deck))
    case DeckAxis.avgManaValue:
      return AverageCMC({deck: deck})
  }
  return null
}
