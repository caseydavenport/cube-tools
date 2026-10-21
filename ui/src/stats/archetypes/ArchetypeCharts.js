// The archetype charts: share and win rate over time, change against the
// average, and the share pie.

import { ARCHETYPES_COPY } from "./copy.js"
import React from 'react'
import { MinWinningPctDecks, Pct } from "../../utils/Utils.js"
import { BucketName, bucketXScale } from "../../utils/Buckets.js"
import { CUBE_AVG_WIN_PERCENT } from "../../utils/Colors.js"
import { Line, Bar, Pie } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, deltaFill, withAlpha, zeroLineGrid } from "../../theme/chartTheme.js"
import { archetypeColor, macroArchetypes } from "./archetypeHelpers.js"
import "../stats.css"

// MacroArchetypeDeltaChart shows which macro archetypes are net positive or net
// negative relative to the cube-wide average win rate (50%). Green bars point up
// (overperforming), red bars point down, sorted best-to-worst.
export function MacroArchetypeDeltaChart(input) {
  let archetypes = input.parsed.archetypeData
  if (archetypes == null) {
    return null
  }

  let rows = []
  for (let arch of archetypes.values()) {
    if (!macroArchetypes.has(arch.type)) {
      continue
    }
    // Skip archetypes with no games so an empty bucket doesn't read as a -50% loser.
    if (arch.wins + arch.losses <= 0) {
      continue
    }
    rows.push({ type: arch.type, delta: arch.win_percent - CUBE_AVG_WIN_PERCENT, winPercent: arch.win_percent, count: arch.count })
  }
  rows.sort((a, b) => b.delta - a.delta)

  if (rows.length === 0) {
    return null
  }

  const labels = rows.map(r => r.type.charAt(0).toUpperCase() + r.type.slice(1))
  const deltas = rows.map(r => r.delta)
  // A function, so Chart.js picks the bar colors again when the scheme changes.
  const barColors = ctx => deltaFill(rows[ctx.dataIndex].delta)

  const data = {
    labels,
    datasets: [
      {
        label: ARCHETYPES_COPY.charts.deltaSeries,
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
        text: ARCHETYPES_COPY.charts.deltaTitle,
        font: { size: "16pt" },
      },
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: {
          label: function(ctx) {
            let r = rows[ctx.dataIndex]
            let sign = r.delta >= 0 ? "+" : ""
            return ARCHETYPES_COPY.charts.deltaTooltip({ sign: sign, delta: r.delta.toFixed(1), winPercent: r.winPercent.toFixed(0), count: r.count })
          },
        },
      }),
    },
    scales: {
      x: { ticks: { font: { size: 14 } }, grid: { display: false } },
      y: {
        title: { display: true, text: ARCHETYPES_COPY.charts.deltaAxis, font: { size: 14 } },
        ticks: { font: { size: 14 }, callback: (v) => (v > 0 ? "+" : "") + v + "%" },
        grid: { color: (ctx) => zeroLineGrid(ctx) },
      },
    },
  }

  return (
    <div className="stats-chart-700">
      <Bar options={options} data={data} />
    </div>
  )
}

export function MacroArchetypesChart(input) {
  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of input.parsed.deckBuckets) {
    labels.push(BucketName(bucket))
  }

  // Parse the buckets.
  let archs = ["aggro", "midrange", "control"]
  let datasets = new Map()
  for (let arch of archs) {
    datasets.set(arch, [])
  }
  for (let bucket of input.parsed.deckBuckets) {
    let stats = bucket.archetypeData
    for (let archetype of archs) {
      let archetypeStats = stats.get(archetype)
      if (archetypeStats == null) {
        datasets.get(archetype).push(0)
        continue
      }
      if (input.dataset === "wins") {
        datasets.get(archetype).push(archetypeStats.win_percent)
      } else if (input.dataset === "percent_of_wins") {
        datasets.get(archetype).push(archetypeStats.percent_of_wins)
      } else if (input.dataset === "cmc") {
        datasets.get(archetype).push(archetypeStats.avg_cmc)
      } else if (input.dataset === "winning_pct") {
        // % of decks of this archetype with a 2-1 or better record. Denominator
        // is all decks, not just decisive ones. Drop low-sample buckets so we
        // don't draw noise.
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total >= MinWinningPctDecks ? Pct(archetypeStats.winning, total) : null)
      } else if (input.dataset === "trophy_pct") {
        // % of decks of this archetype that won a trophy. Use count (all
        // decks of this archetype) rather than winning + losing, which
        // excludes 2-2 / 1-1 results entirely.
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total > 0 ? Math.round(100 * archetypeStats.trophies / total) : 0)
      } else if (input.dataset === "lastplace_pct") {
        let total = archetypeStats.count || 0
        datasets.get(archetype).push(total > 0 ? Math.round(100 * archetypeStats.last_place / total) : 0)
      } else {
        datasets.get(archetype).push(archetypeStats.build_percent)
      }
    }
  }

  let chartDataset = [
      {
        label: ARCHETYPES_COPY.charts.aggro,
        data: datasets.get("aggro"),
        borderColor: archetypeColor("aggro"),
        backgroundColor: archetypeColor("aggro"),
      },
      {
        label: ARCHETYPES_COPY.charts.midrange,
        data: datasets.get("midrange"),
        borderColor: archetypeColor("midrange"),
        backgroundColor: archetypeColor("midrange"),
      },
      {
        label: ARCHETYPES_COPY.charts.control,
        data: datasets.get("control"),
        borderColor: archetypeColor("control"),
        backgroundColor: archetypeColor("control"),
      },
  ]

  let title = ARCHETYPES_COPY.charts.buildRateTitle({ bucketSize: input.bucketSize })
  switch (input.dataset) {
    case "wins":
      title = ARCHETYPES_COPY.charts.winRateTitle({ bucketSize: input.bucketSize })
      break;
    case "cmc":
      title = ARCHETYPES_COPY.charts.avgManaValueTitle({ bucketSize: input.bucketSize })
      break
    case "percent_of_wins":
      title = ARCHETYPES_COPY.charts.percentOfAllWinsTitle({ bucketSize: input.bucketSize })
      break
    case "winning_pct":
      title = ARCHETYPES_COPY.charts.winningPctTitle({ bucketSize: input.bucketSize })
      break
    case "trophy_pct":
      title = ARCHETYPES_COPY.charts.trophyPctTitle({ bucketSize: input.bucketSize })
      break
    case "lastplace_pct":
      title = ARCHETYPES_COPY.charts.lastPlacePctTitle({ bucketSize: input.bucketSize })
      break
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 0}},
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

  const data = {labels, datasets: chartDataset};
  return (
    <div className="stats-chart-700-full">
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

// PIE_ARCHETYPES are the archetypes the pie charts split decks into.
const PIE_ARCHETYPES = [
  { key: "aggro", label: ARCHETYPES_COPY.charts.aggro },
  { key: "midrange", label: ARCHETYPES_COPY.charts.midrange },
  { key: "control", label: ARCHETYPES_COPY.charts.control },
]

// MacroArchetypesPieChart splits decks, or wins, between the archetypes. An
// archetype with no decks in the range is left out rather than breaking the
// chart.
export function MacroArchetypesPieChart(input) {
  let stats = input.parsed.archetypeData

  let title = ARCHETYPES_COPY.charts.pieDecks
  let field = "count"
  if (input.dataset === "wins") {
    title = ARCHETYPES_COPY.charts.pieWins
    field = "wins"
  }

  const labels = []
  const graphData = []
  const fills = []
  const borders = []
  for (const archetype of PIE_ARCHETYPES) {
    const archetypeStats = stats.get(archetype.key)
    if (!archetypeStats) {
      continue
    }
    const color = archetypeColor(archetype.key)
    labels.push(archetype.label)
    graphData.push(archetypeStats[field])
    fills.push(withAlpha(color, 0.35))
    borders.push(color)
  }

  let data = {
    labels,
    datasets: [
      {
        label: title,
        data: graphData,
        backgroundColor: fills,
        borderColor: borders,
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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

  return (
    <div className="stats-chart-700-full">
      <Pie height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
