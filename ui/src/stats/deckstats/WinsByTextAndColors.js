// Win charts by what the deck's cards do and by its number of colors.

import React from 'react'
import { Pct } from "../../utils/Utils.js"
import { Wins, Losses } from "../../utils/Deck.js"
import { Bar } from 'react-chartjs-2'
import { currentChartTheme } from "../../theme/chartTheme.js"
import { lossColor, winColor } from "./deckChartHelpers.js"

export function WinsByOracleText(input) {
  let bucketSize = 3
  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

    let num = 0
    for (let card of deck.mainboard) {
      for (let match of input.matches) {
        if (card.oracle_text.toLowerCase().match(match)){
          num += 1
          break
        }
      }
    }

    let bucket = Math.round(num/bucketSize)*bucketSize
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
        text: input.title,
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
    labels.push(`${start}-${start+bucketSize}`)
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
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function WinsByNumberOfColors(input) {
  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    let num = deck.colors.length

    if (!wins.has(num)) {
      wins.set(num, 0)
      losses.set(num, 0)
    }
    wins.set(num, wins.get(num) + Wins(deck))
    losses.set(num, losses.get(num) + Losses(deck))
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
        text: "Wins by # colors",
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

  const labels = [...wins.keys()].sort(function(a, b) {return a - b})
  let winsData= []
  for (let l of labels) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of labels) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of labels) {
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        type: "bar",
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        type: "bar",
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },
    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
