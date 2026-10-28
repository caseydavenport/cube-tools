// Charts of how decks are built: the mana curve and card type mix of each
// macro archetype, and how many off-color cards decks splash.

import React from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, seriesColor, withAlpha } from "../../theme/chartTheme.js"
import { intervalDataset, lineAtGrid, pointDataset, titleOptions } from "./deckChartHelpers.js"
import { ARCHETYPE_NAMES } from "./HeadToHeadCharts.js"
import "../stats.css"

// CURVE_LABELS name the mana curve's x axis; the last slot holds 7 and up.
const CURVE_LABELS = ["0", "1", "2", "3", "4", "5", "6", "7+"]

// MIX_TYPES are the card types the type mix stacks, in the server's keys.
const MIX_TYPES = ["Creature", "Instant", "Sorcery", "Enchantment", "Artifact", "Planeswalker"]

// archetypeLabel names a curve or mix row with its deck count.
function archetypeLabel(row) {
  return `${ARCHETYPE_NAMES[row.archetype]} (${row.decks} decks)`
}

// ManaCurveChart draws one line per macro archetype: the average number of
// nonland cards at each mana value.
export function ManaCurveChart(input) {
  const datasets = []
  input.deckCharts.mana_curve.forEach((row, i) => {
    datasets.push({
      label: archetypeLabel(row),
      data: row.counts,
      borderColor: seriesColor(i),
      backgroundColor: seriesColor(i),
    })
  })

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: "Mana value" } },
      y: { min: 0, title: { display: true, text: "Avg. nonland cards per deck" } },
    },
    plugins: {
      title: titleOptions("Mana curve by archetype"),
    },
  }

  return (
    <div className="stats-widget-chart">
      <Line height={"300px"} width={"300px"} options={options} data={{ labels: CURVE_LABELS, datasets }} />
    </div>
  )
}

// TypeMixChart stacks one bar per macro archetype: the average number of
// nonland cards of each type. A card with two types counts in both.
export function TypeMixChart(input) {
  const rows = input.deckCharts.type_mix

  const labels = []
  for (const row of rows) {
    labels.push(archetypeLabel(row))
  }

  const datasets = []
  MIX_TYPES.forEach((cardType, i) => {
    const values = []
    for (const row of rows) {
      values.push(row.counts[cardType])
    }
    datasets.push({
      label: cardType,
      data: values,
      backgroundColor: withAlpha(seriesColor(i), 0.7),
      borderColor: seriesColor(i),
      borderWidth: 1,
    })
  })

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true },
      y: { stacked: true, min: 0, title: { display: true, text: "Avg. nonland cards per deck" } },
    },
    plugins: {
      title: titleOptions("Card types by archetype"),
    },
  }

  return (
    <div className="stats-widget-chart">
      <Bar height={"300px"} width={"300px"} options={options} data={{ labels, datasets }} />
    </div>
  )
}

// SplashSizeChart shows how many decks play each number of cards outside
// their main colors, as bars, and how those decks did, as dots with intervals.
export function SplashSizeChart(input) {
  const buckets = input.deckCharts.splash

  const labels = []
  const deckCounts = []
  const winRates = []
  const intervals = []
  for (const bucket of buckets) {
    labels.push(bucket.label)
    deckCounts.push(bucket.decks)
    if (bucket.wins + bucket.losses + bucket.draws === 0) {
      winRates.push(null)
      intervals.push(null)
    } else {
      winRates.push(bucket.win_percent)
      intervals.push([bucket.win_percent_low, bucket.win_percent_high])
    }
  }

  // tooltipLabel describes the hovered bucket's decks or record.
  const tooltipLabel = (ctx) => {
    const bucket = buckets[ctx.dataIndex]
    if (ctx.datasetIndex === 0) {
      return `Win % ${bucket.win_percent} over ${bucket.wins + bucket.losses + bucket.draws} games`
    }
    if (ctx.datasetIndex === 1) {
      return `Interval: ${bucket.win_percent_low}% to ${bucket.win_percent_high}%`
    }
    return `${bucket.decks} decks`
  }

  const winRate = pointDataset("Win %", winRates)
  winRate.yAxisID = "winRate"
  const interval = intervalDataset("Interval", intervals)
  interval.yAxisID = "winRate"
  const decks = {
    label: "Decks",
    data: deckCounts,
    yAxisID: "decks",
    backgroundColor: () => withAlpha(seriesColor(1), 0.35),
    borderColor: seriesColor(1),
    borderWidth: 1,
    grouped: false,
    order: 3,
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: "Cards outside the deck's main colors" } },
      decks: { position: "left", min: 0, title: { display: true, text: "Decks" }, grid: { display: false } },
      winRate: {
        position: "right",
        min: 0,
        max: 100,
        title: { display: true, text: "Win %" },
        grid: { color: lineAtGrid(50) },
      },
    },
    plugins: {
      title: titleOptions("Splash size"),
      tooltip: chartTooltip(currentChartTheme(), { callbacks: { label: tooltipLabel } }),
    },
  }

  return (
    <div className="stats-widget-chart">
      <Bar height={"300px"} width={"300px"} options={options} data={{ labels, datasets: [winRate, interval, decks] }} />
    </div>
  )
}
