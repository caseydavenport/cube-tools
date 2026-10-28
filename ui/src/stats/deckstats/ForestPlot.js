// The forest plot: one row per deck feature, showing how much win rate moves
// with it. A dot marks the estimate and a bar its interval; a bar that crosses
// the line at 0 can't be told apart from no effect.

import React from 'react'
import { Bar } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, zeroLineGrid } from "../../theme/chartTheme.js"
import { intervalDataset, pointDataset, titleOptions } from "./deckChartHelpers.js"
import { forestPoints } from "./deckChartsData.js"
import "../stats.css"

// FOREST_ROWS names each row the server sends, by key. unit is what one
// standard deviation of the feature is counted in.
const FOREST_ROWS = {
  avg_mana_value: { label: "Avg. mana value", unit: "mana value" },
  creatures: { label: "Creatures", unit: "creatures" },
  sorceries: { label: "Sorceries", unit: "sorceries" },
  instants: { label: "Instants", unit: "instants" },
  planeswalkers: { label: "Planeswalkers", unit: "planeswalkers" },
  enchantments: { label: "Enchantments", unit: "enchantments" },
  lands: { label: "Lands", unit: "lands" },
  nonbasic_lands: { label: "Nonbasic lands", unit: "nonbasic lands" },
  colors: { label: "Colors", unit: "colors" },
  removal: { label: "Removal", unit: "removal spells" },
  counterspells: { label: "Counterspells", unit: "counterspells" },
  card_draw: { label: "Card draw", unit: "card draw spells" },
  lifegain: { label: "Lifegain", unit: "lifegain cards" },
  graveyard: { label: "Graveyard", unit: "graveyard cards" },
  discard: { label: "Discard", unit: "discard cards" },
}

// rowName returns the label for a row key, or the key itself if it's new.
function rowName(key) {
  const row = FOREST_ROWS[key]
  if (row == null) {
    return key
  }
  return row.label
}

// spreadText says what one standard deviation of a row's feature is.
function spreadText(row) {
  let unit = row.key
  if (FOREST_ROWS[row.key] != null) {
    unit = FOREST_ROWS[row.key].unit
  }
  return `1 standard deviation = ${row.std_dev} ${unit}, across ${row.decks} decks`
}

// ForestPlot draws every forest row the server sent.
export function ForestPlot(input) {
  const rows = input.deckCharts.forest
  const points = forestPoints(rows)

  const labels = []
  for (const key of points.labels) {
    labels.push(rowName(key))
  }

  // tooltipLabel describes the hovered row's estimate, or why it has none.
  const tooltipLabel = (ctx) => {
    const row = rows[ctx.dataIndex]
    if (points.notes[ctx.dataIndex]) {
      return "Not enough decks or no spread to measure"
    }
    if (ctx.datasetIndex === 0) {
      return `${row.effect} win % per standard deviation`
    }
    return `Interval: ${row.effect_low} to ${row.effect_high}`
  }

  // tooltipFooter adds the feature's spread under every row's tooltip.
  const tooltipFooter = (items) => {
    if (items.length === 0) {
      return ""
    }
    return spreadText(rows[items[0].dataIndex])
  }

  const options = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: { display: true, text: "Change in win % per standard deviation of the feature" },
        grid: { color: zeroLineGrid },
      },
    },
    plugins: {
      title: titleOptions("Which deck features move win rate"),
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), {
        callbacks: { label: tooltipLabel, footer: tooltipFooter },
      }),
    },
  }

  const data = {
    labels,
    datasets: [
      pointDataset("Effect", points.dots),
      intervalDataset("Interval", points.bars),
    ],
  }

  return (
    <div className="stats-widget-chart">
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  )
}
