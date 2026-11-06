// The Archetypes page's finishes chart: how each macro archetype's decks
// finished, from trophies to last places, as shares of its decks.

import React from "react"
import { Bar } from "react-chartjs-2"
import { useComputedColorScheme } from "@mantine/core"
import { chartTooltip, currentChartTheme, withAlpha } from "../../theme/chartTheme.js"
import { FINISHES, finishRows } from "./archetypeFinishesModel.js"

// finishColor is a finish's bar color in theme: full good or bad at the ends,
// paler toward the middle, and grey for an even record.
function finishColor(key, theme) {
  switch (key) {
    case "trophy":
      return theme.goodFill
    case "winning":
      return withAlpha(theme.good, 0.4)
    case "losing":
      return withAlpha(theme.bad, 0.4)
    case "last":
      return theme.badFill
    default:
      return withAlpha(theme.muted, 0.35)
  }
}

// capitalize turns "aggro" into "Aggro" for the chart's row labels.
function capitalize(word) {
  return word[0].toUpperCase() + word.slice(1)
}

// ArchetypeFinishes draws one bar per macro archetype, split by finish. Game
// win rates barely differ between archetypes, but how their decks finish does.
export function ArchetypeFinishes({ archetypeData }) {
  // Reading the scheme re-renders the chart in the new colors on a switch.
  useComputedColorScheme("light")
  const theme = currentChartTheme()

  const rows = finishRows(archetypeData)
  if (rows.length === 0) {
    return null
  }

  const datasets = FINISHES.map(finish => ({
    label: finish.label,
    data: rows.map(row => row.shares[finish.key]),
    backgroundColor: finishColor(finish.key, theme),
    borderWidth: 0,
  }))

  // tooltipLine reads "Trophy (3-0): 7 of 67 decks (10%)".
  function tooltipLine(ctx) {
    const row = rows[ctx.dataIndex]
    const finish = FINISHES[ctx.datasetIndex]
    const count = row.counts[finish.key]
    return `${finish.label}: ${count} of ${row.decks} decks (${Math.round(ctx.parsed.x)}%)`
  }

  const options = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true, min: 0, max: 100, ticks: { callback: v => `${v}%` }, grid: { color: theme.grid } },
      y: { stacked: true, grid: { display: false } },
    },
    plugins: {
      legend: { position: "bottom" },
      tooltip: chartTooltip(theme, { callbacks: { label: tooltipLine } }),
    },
  }

  const data = { labels: rows.map(row => capitalize(row.type)), datasets }
  return (
    <div className="archetype-finishes-chart">
      <Bar options={options} data={data} />
    </div>
  )
}
