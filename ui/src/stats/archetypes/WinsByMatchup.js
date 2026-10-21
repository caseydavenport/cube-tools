// The chart of one archetype's wins and losses against each of the others.

import { ARCHETYPES_COPY } from "./copy.js"
import React from 'react'
import { Pct } from "../../utils/Utils.js"
import { Bar } from 'react-chartjs-2'
import { currentChartTheme } from "../../theme/chartTheme.js"
import "../stats.css"

export function WinsByMatchup(input) {
  // The server sends no items when no deck has an archetype.
  const items = input.matchups?.items || []
  if (items.length === 0) {
    return null
  }

  // For now, just use the first matchup.
  let matchup = items[0]
  for (let m of items) {
    if (m.name == input.focus) {
      matchup = m;
      break;
    }
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
        text: ARCHETYPES_COPY.matchup.title({ name: matchup.name }),
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

  // Sort the vs. by relative "speed" - i.e., aggro, midrange, control.
  let versus = new Array()
  let find = function(t) {
    if (matchup.versus == null) {
      return {
        name: t,
        win: 0,
        loss: 0,
      }
    }

    for (let vs of matchup.versus) {
      if (vs.name == t) {
        return vs
      }
    }

    // Not found. Return a dummy.
    return {
      name: t,
      win: 0,
      loss: 0,
    }
  }

  let ats = ["aggro", "midrange", "control"]
  for (let n of ats) {
    if (n == matchup.name) {
      continue;
    }
    versus.push(find(n))
  }

  var labels = []
  let winsData= []
  let lossData = []
  let percentages = []
  for (let vs of versus) {
    labels.push(vs.name)
    winsData.push(vs.win)
    lossData.push(vs.loss)
    percentages.push(Pct(vs.win, vs.win + vs.loss))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: ARCHETYPES_COPY.matchup.winPct,
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: ARCHETYPES_COPY.matchup.wins,
        data: winsData,
        backgroundColor: () => currentChartTheme().goodFill,
      },
      {
        label: ARCHETYPES_COPY.matchup.losses,
        data: lossData,
        backgroundColor: () => currentChartTheme().badFill,
      },

    ],
  };

  return (
    <div className="stats-chart-700-full">
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
