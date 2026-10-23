// The Colors charts over time: each color's rate, and its win rate against
// the cube average.

import React from 'react'
import { Colors, CUBE_AVG_WIN_PERCENT, guildColor } from "../../utils/Colors.js"
import { bucketXScale } from "../../utils/Buckets.js"
import { MinWinningPctDecks, Pct } from "../../utils/Utils.js"
import { Line, Bar } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, deltaFill, zeroLineGrid } from "../../theme/chartTheme.js"
import { colorName } from "../../utils/colorNames.js"
import { colorIsDisplayed } from "./ColorStatsTable.js"
import { COLORS_COPY } from "./copy.js"
import "../stats.css"

// ColorPerformanceDeltaChart shows, at a glance, which colors are net positive or
// net negative relative to the cube-wide average win rate. Each bar is a color's
// win rate minus 50%; green bars point up (overperforming), red bars point down.
export function ColorPerformanceDeltaChart(input) {
  if (input == null || input.colorData == null) {
    return null
  }

  // Resolve the active color set, honoring the selected bucket the same way the
  // stats table does so the chart and table always agree.
  let colorData = Array.from(input.colorData.values())
  let buckets = input.parsed.colorDataBucketed
  if (buckets.length > 0 && input.selectedBucket !== "ALL") {
    for (let bucket of buckets) {
      if (bucket.name === input.selectedBucket) {
        colorData = Array.from(new Map(Object.entries(bucket.data)).values())
        break
      }
    }
  }

  // Filter to the selected identity length and compute each color's delta, then
  // sort best-to-worst so the bars read left (overperforming) to right.
  let rows = []
  for (let d of colorData) {
    if (!colorIsDisplayed(d.color, input.colorTypeSelection)) {
      continue
    }
    rows.push({ color: d.color, delta: d.win_percent - CUBE_AVG_WIN_PERCENT, winPercent: d.win_percent, numDecks: d.num_decks })
  }
  rows.sort((a, b) => b.delta - a.delta)

  if (rows.length === 0) {
    return null
  }

  const labels = rows.map(r => colorName(r.color))
  const deltas = rows.map(r => r.delta)
  // A function, so Chart.js picks the bar colors again when the scheme changes.
  const barColors = ctx => deltaFill(rows[ctx.dataIndex].delta)

  const data = {
    labels,
    datasets: [
      {
        label: COLORS_COPY.rateCharts.deltaDatasetLabel,
        data: deltas,
        backgroundColor: barColors,
        borderColor: barColors,
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: COLORS_COPY.rateCharts.deltaTitle,
        font: { size: "16pt" },
      },
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: {
          label: function(ctx) {
            let r = rows[ctx.dataIndex]
            let sign = r.delta >= 0 ? "+" : ""
            return COLORS_COPY.rateCharts.deltaTooltip({
              sign: sign,
              delta: r.delta.toFixed(1),
              winPercent: r.winPercent.toFixed(0),
              numDecks: r.numDecks,
            })
          },
        },
      }),
    },
    scales: {
      x: { ticks: { font: { size: 14 } }, grid: { display: false } },
      y: {
        title: { display: true, text: COLORS_COPY.rateCharts.deltaAxisTitle, font: { size: 14 } },
        ticks: { font: { size: 14 }, callback: (v) => (v > 0 ? "+" : "") + v + "%" },
        grid: { color: (ctx) => zeroLineGrid(ctx) },
      },
    },
  }

  return (
    <div className="chart-container">
      <div className="colors-rate-chart">
        <Bar options={options} data={data} />
      </div>
    </div>
  )
}

export function ColorRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.parsed.colorDataBucketed;

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  // Parse the buckets into color data.
  let monoColors = ["W", "U", "B", "R", "G"]
  let dualColors = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"]
  let triColors = ["WUG", "WUB", "UBR", "BRG", "WRG", "WBG", "WUR", "UBG", "WBR", "URG"]
  let allColors = [...monoColors, ...dualColors, ...triColors]
  let colorDatasets = new Map()
  for (let color of allColors) {
    colorDatasets.set(color, [])
  }
  for (let bucket of buckets) {
    let stats = new Map(Object.entries(bucket.data))

    for (let color of allColors) {
      if (!stats.has(color)) {
        colorDatasets.get(color).push(0)
        continue
      }

      if (input.dataset === "wins") {
        colorDatasets.get(color).push(stats.get(color).win_percent)
      } else if (input.dataset === "bayes_wins") {
        colorDatasets.get(color).push(stats.get(color).bayesian_win_percent)
      } else if (input.dataset === "pick_percentage") {
        colorDatasets.get(color).push(stats.get(color).total_pick_percentage)
      } else if (input.dataset === "splash") {
        colorDatasets.get(color).push(stats.get(color).average_deck_percentage)
      } else if (input.dataset === "percent_of_wins") {
        colorDatasets.get(color).push(stats.get(color).percent_of_wins)
      } else if (input.dataset === "winning_pct") {
        // % of decks of this color with a 2-1 or better record. Denominator
        // is all decks, not just decisive ones - 1-1 / 2-2 decks should pull
        // the rate down, not vanish. Drop buckets with too few decks to carry
        // signal so we don't draw noise.
        let c = stats.get(color)
        let total = c.num_decks || 0
        colorDatasets.get(color).push(total >= MinWinningPctDecks ? Pct(c.top_half || 0, total) : null)
      } else if (input.dataset === "trophy_pct") {
        // % of decks of this color that won a trophy. Use num_decks as the
        // denominator (not top_half + bottom_half, which excludes 2-2 and 1-1
        // results entirely).
        let c = stats.get(color)
        let total = c.num_decks || 0
        colorDatasets.get(color).push(total > 0 ? Math.round(100 * (c.trophies || 0) / total) : 0)
      } else if (input.dataset === "lastplace_pct") {
        let c = stats.get(color)
        let total = c.num_decks || 0
        colorDatasets.get(color).push(total > 0 ? Math.round(100 * (c.last_place || 0) / total) : 0)
      } else {
        colorDatasets.get(color).push(stats.get(color).build_percent)
      }
    }
  }

  // Configuration for datasets.
  let hoverBorderWidth = 4;

  let monoColorDatasets = [
      {
        label: COLORS_COPY.rateCharts.white,
        data: colorDatasets.get("W"),
        borderColor: Colors.get("W"),
        backgroundColor: Colors.get("W"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: COLORS_COPY.rateCharts.blue,
        data: colorDatasets.get("U"),
        borderColor: Colors.get("U"),
        backgroundColor: Colors.get("U"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: COLORS_COPY.rateCharts.black,
        data: colorDatasets.get("B"),
        borderColor: Colors.get("B"),
        backgroundColor: Colors.get("B"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: COLORS_COPY.rateCharts.red,
        data: colorDatasets.get("R"),
        borderColor: Colors.get("R"),
        backgroundColor: Colors.get("R"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: COLORS_COPY.rateCharts.green,
        data: colorDatasets.get("G"),
        borderColor: Colors.get("G"),
        backgroundColor: Colors.get("G"),
        hoverBorderWidth: hoverBorderWidth,
      },
  ]

  // Generate a dual-color dataset as well.
  let dualColorDatasets = []
  for (let color of dualColors) {
    dualColorDatasets.push({
      label: colorName(color),
      data: colorDatasets.get(color),
      borderColor: guildColor(color),
      backgroundColor: guildColor(color),
      hoverBorderWidth: hoverBorderWidth,
    })
  }

  let triColorDatasets = []
  for (let color of triColors) {
    triColorDatasets.push({
      label: colorName(color),
      data: colorDatasets.get(color),
      borderColor: guildColor(color),
      backgroundColor: guildColor(color),
      hoverBorderWidth: hoverBorderWidth,
    })
  }

  let dataset = monoColorDatasets
  switch (input.colorMode) {
    case "Dual":
      dataset = dualColorDatasets
      break;
    case "Trio":
      dataset = triColorDatasets
      break;
    case "Any":
      dataset = [...monoColorDatasets, ...dualColorDatasets, ...triColorDatasets]
      break;
  }

  let title = "UNKNOWN"
  switch (input.dataset) {
    case "builds":
      title = COLORS_COPY.rateCharts.buildsTitle(input.bucketSize)
      break;
    case "wins":
      title = COLORS_COPY.rateCharts.winsTitle(input.bucketSize)
      break;
    case "pick_percentage":
      title = COLORS_COPY.rateCharts.pickPercentageTitle(input.bucketSize)
      break;
    case "splash":
      title = COLORS_COPY.rateCharts.splashTitle(input.bucketSize)
      break;
    case "percent_of_wins":
      title = COLORS_COPY.rateCharts.percentOfWinsTitle(input.bucketSize)
      break;
    case "winning_pct":
      title = COLORS_COPY.rateCharts.winningPctTitle(input.bucketSize)
      break;
    case "trophy_pct":
      title = COLORS_COPY.rateCharts.trophyPctTitle(input.bucketSize)
      break;
    case "lastplace_pct":
      title = COLORS_COPY.rateCharts.lastPlacePctTitle(input.bucketSize)
      break;
    case "bayes_wins":
      title = COLORS_COPY.rateCharts.bayesWinTitle(input.bucketSize)
      break;
  }

  // Calculate the max based on our data set, which structured as an array of dictionary objects
  // each with a data field that is itself an array of values.
  let max = 0
  let min = 100
  for (let set of dataset) {
    let values = set.data
    let colorMax = Math.max(...values)
    let colorMin = Math.min(...values)
    if (colorMax > max) {
      max = colorMax
    }
    if (colorMin < min) {
      min = colorMin
    }
  }
  // Round things.
  max = Math.ceil(max / 10) * 10
  min = Math.floor(min / 20) * 20
  if (max >= 90) {
    max = 100
  }
  if (min <= 10) {
    min = 0
  }

  const options = {
    responsive: true,
    borderWidth: 3,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: min, max: max}},
    hover: {
      mode: 'dataset'
    },
    elements: {
      point: {
        hitRadius: 10
      }
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
    <div className="stats-main-chart">
      <Line height={"300px"} options={options} data={data} />
    </div>
  );
}
