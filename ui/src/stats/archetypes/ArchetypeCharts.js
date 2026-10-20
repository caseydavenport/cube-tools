// The archetype charts: share and win rate over time, change against the
// average, and the share pie.

import React from 'react'
import { MinWinningPctDecks, Pct } from "../../utils/Utils.js"
import { BucketName, bucketXScale } from "../../utils/Buckets.js"
import { CUBE_AVG_WIN_PERCENT } from "../../utils/Colors.js"
import { Line, Bar, Pie } from 'react-chartjs-2'
import { deltaFill, withAlpha, zeroLineGrid } from "../../theme/chartTheme.js"
import { archetypeColor, macroArchetypes } from "./archetypeHelpers.js"

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
        label: "Win rate vs cube average",
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
        text: "Net performance vs cube average (win %)",
        font: { size: "16pt" },
      },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            let r = rows[ctx.dataIndex]
            let sign = r.delta >= 0 ? "+" : ""
            return `${sign}${r.delta.toFixed(1)}% (win ${r.winPercent.toFixed(0)}%, ${r.count} decks)`
          },
        },
      },
    },
    scales: {
      x: { ticks: { font: { size: 14 } }, grid: { display: false } },
      y: {
        title: { display: true, text: "Δ win % vs 50%", font: { size: 14 } },
        ticks: { font: { size: 14 }, callback: (v) => (v > 0 ? "+" : "") + v + "%" },
        grid: { color: (ctx) => zeroLineGrid(ctx) },
      },
    },
  }

  return (
    <div style={{ "height": "700px" }}>
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
        label: 'Aggro',
        data: datasets.get("aggro"),
        borderColor: archetypeColor("aggro"),
        backgroundColor: archetypeColor("aggro"),
      },
      {
        label: 'Midrange',
        data: datasets.get("midrange"),
        borderColor: archetypeColor("midrange"),
        backgroundColor: archetypeColor("midrange"),
      },
      {
        label: 'Control',
        data: datasets.get("control"),
        borderColor: archetypeColor("control"),
        backgroundColor: archetypeColor("control"),
      },
  ]

  let title = `Build rate (bucket size = ${input.bucketSize} drafts)`
  switch (input.dataset) {
    case "wins":
      title = `Win rate (bucket size = ${input.bucketSize} drafts)`
      break;
    case "cmc":
      title = `Avg. mana value (bucket size = ${input.bucketSize} drafts)`
      break
    case "percent_of_wins":
      title = `Percent of all wins (bucket size = ${input.bucketSize} drafts)`
      break
    case "winning_pct":
      title = `Winning % (bucket size = ${input.bucketSize} drafts)`
      break
    case "trophy_pct":
      title = `Trophy % (bucket size = ${input.bucketSize} drafts)`
      break
    case "lastplace_pct":
      title = `Last place % (bucket size = ${input.bucketSize} drafts)`
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
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

// PIE_ARCHETYPES are the archetypes the pie charts split decks into.
const PIE_ARCHETYPES = [
  { key: "aggro", label: "Aggro" },
  { key: "midrange", label: "Midrange" },
  { key: "control", label: "Control" },
]

// MacroArchetypesPieChart splits decks, or wins, between the archetypes. An
// archetype with no decks in the range is left out rather than breaking the
// chart.
export function MacroArchetypesPieChart(input) {
  let stats = input.parsed.archetypeData

  let title = `Decks`
  let field = "count"
  if (input.dataset === "wins") {
    title = `Wins`
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
    <div style={{"height":"700px", "width":"100%"}}>
      <Pie height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
