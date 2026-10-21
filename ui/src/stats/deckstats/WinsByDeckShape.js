// Win charts by deck shape: mana cost, card types, and nonbasic land count.

import React from 'react'
import { Pct } from "../../utils/Utils.js"
import { Wins, Losses } from "../../utils/Deck.js"
import { Bar } from 'react-chartjs-2'
import { currentChartTheme } from "../../theme/chartTheme.js"
import { lossColor, winColor } from "./deckChartHelpers.js"
import { DECKSTATS_COPY } from "./copy.js"
import "../stats.css"

export function WinsByManaCost(input) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.winsByDeckShape.manaCostTitle,
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

  // Pull out the wins / losses by CMC data from the input.
  let winsByCMC = input.data.all.winsByCMC
  let lossesByCMC = input.data.all.lossesByCMC

  const labels = [...winsByCMC.keys()].sort()
  let winsData= []
  for (let l of labels) {
    winsData.push(winsByCMC.get(l))
  }
  let lossData = []
  for (let l of labels) {
    lossData.push(lossesByCMC.get(l))
  }
  let percentages = []
  for (let l of labels) {
    percentages.push(Pct(winsByCMC.get(l), winsByCMC.get(l) + lossesByCMC.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: DECKSTATS_COPY.winsCharts.winPercentSeries,
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: DECKSTATS_COPY.winsCharts.winsSeries,
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: DECKSTATS_COPY.winsCharts.lossesSeries,
        data: lossData,
        backgroundColor: lossColor,
      },
    ],
  };

  return (
    <div className="stats-chart-700-full">
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function WinsByCardType(input) {
  // Go through all the decks, and build up a map of wins by averge num
  // of the deck. We round num to create buckets.
  let wins = new Map()
  let losses = new Map()
  let bucketSize = 3
  if (input.bucketSize != null) {
    bucketSize = input.bucketSize
  }
  for (let deck of input.decks) {
    // Skip decks with no mainboard.
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

    // Count the number of creatures in this deck.
    let num = 0
    for (let card of deck.mainboard) {
      if (card.types.includes(input.type)) {
        num += 1
      }
    }

    // Create buckets of creature amounts and put this into it.
    let bucket = Math.round(num/bucketSize) * bucketSize
    if (!wins.has(bucket)) {
      wins.set(bucket, 0)
      losses.set(bucket, 0)
    }
    wins.set(bucket, wins.get(bucket) + Wins(deck))
    losses.set(bucket, losses.get(bucket) + Losses(deck))
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.winsByDeckShape.cardTypeTitle(input.type),
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

  const sorted = [...wins.keys()].sort(function(a, b) {return a - b})
  var labels = []
  for (let start of sorted) {
    if (bucketSize == 1) {
      labels.push(`${start}`)
    } else {
      labels.push(`${start}-${start+bucketSize}`)
    }
  }
  let winsData= []
  for (let l of sorted ) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of sorted) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of sorted) {
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: DECKSTATS_COPY.winsCharts.winPercentSeries,
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: DECKSTATS_COPY.winsCharts.winsSeries,
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: DECKSTATS_COPY.winsCharts.lossesSeries,
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div className="stats-chart-700-full">
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function WinsByNonBasicLandDensity(input) {
  let wins = input.data.all.winsByNonBasicLands
  let losses = input.data.all.lossesByNonBasicLands

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.winsByDeckShape.nonbasicLandsTitle,
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

  const sorted = [...wins.keys()].sort(function(a, b) {return a - b})
  let labels = []
  for (let start of sorted) {
    labels.push(`${start}-${start+input.data.all.nonBasicLandsBucketSize}`)
  }
  let winsData= []
  for (let l of sorted) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of sorted) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of sorted) {
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: DECKSTATS_COPY.winsCharts.winPercentSeries,
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: DECKSTATS_COPY.winsCharts.winsSeries,
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: DECKSTATS_COPY.winsCharts.lossesSeries,
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div className="stats-chart-700-full">
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
