// Charts that compare the two decks in each game: how the deck with more of
// a feature did, and how often each macro archetype's matches went to three.

import React from 'react'
import { Bar } from 'react-chartjs-2'
import { DropdownHeader } from "../../components/Dropdown.js"
import { chartTooltip, currentChartTheme } from "../../theme/chartTheme.js"
import { intervalDataset, lineAtGrid, pointDataset, titleOptions } from "./deckChartHelpers.js"
import "../stats.css"

// HEAD_TO_HEAD_FEATURES are the features the chart can compare, by the key
// the server uses. axis names the gap on the x axis.
const HEAD_TO_HEAD_FEATURES = [
  { value: "avg_mana_value", label: "Avg. mana value", axis: "How much higher the curve was" },
  { value: "creatures", label: "Creatures", axis: "How many more creatures" },
  { value: "interaction", label: "Removal + counterspells", axis: "How many more removal spells and counterspells" },
]

// ARCHETYPE_NAMES are the macro archetypes as the charts show them.
export const ARCHETYPE_NAMES = {
  aggro: "Aggro",
  midrange: "Midrange",
  control: "Control",
}

// featureFor returns the HEAD_TO_HEAD_FEATURES entry for value.
function featureFor(value) {
  for (const feature of HEAD_TO_HEAD_FEATURES) {
    if (feature.value === value) {
      return feature
    }
  }
  return HEAD_TO_HEAD_FEATURES[0]
}

// winRateScale is a 0 to 100 axis with the 50% line drawn stronger.
function winRateScale(title) {
  return {
    min: 0,
    max: 100,
    title: { display: true, text: title },
    grid: { color: lineAtGrid(50) },
  }
}

// HeadToHeadChart shows, for games where one deck had more of a feature than
// the other, how often the deck with more won. A dropdown picks the feature.
export function HeadToHeadChart(input) {
  const [featureKey, setFeatureKey] = React.useState("avg_mana_value")
  const feature = featureFor(featureKey)

  let buckets = input.deckCharts.head_to_head[feature.value]
  if (buckets == null) {
    buckets = []
  }

  const labels = []
  const winRates = []
  const intervals = []
  for (const bucket of buckets) {
    labels.push(bucket.label)
    if (bucket.wins + bucket.losses === 0) {
      winRates.push(null)
      intervals.push(null)
    } else {
      winRates.push(bucket.win_percent)
      intervals.push([bucket.win_percent_low, bucket.win_percent_high])
    }
  }

  // tooltipLabel describes the hovered bucket's record.
  const tooltipLabel = (ctx) => {
    const bucket = buckets[ctx.dataIndex]
    if (ctx.datasetIndex === 0) {
      return `Deck with more won ${bucket.win_percent}% of ${bucket.wins + bucket.losses} games`
    }
    return `Interval: ${bucket.win_percent_low}% to ${bucket.win_percent_high}%`
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: feature.axis } },
      y: winRateScale("Win % of the deck with more"),
    },
    plugins: {
      title: titleOptions(`Head to head: ${feature.label}`),
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), { callbacks: { label: tooltipLabel } }),
    },
  }

  const data = {
    labels,
    datasets: [
      pointDataset("Win %", winRates),
      intervalDataset("Interval", intervals),
    ],
  }

  return (
    <div className="stats-widget-chart">
      <DropdownHeader
        label="Compare"
        options={HEAD_TO_HEAD_FEATURES}
        value={feature.value}
        onChange={(e) => setFeatureKey(e.target.value)}
      />
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  )
}

// CloseMatchChart shows the share of each macro archetype's matches that
// went to a deciding third game.
export function CloseMatchChart(input) {
  const rows = input.deckCharts.close_matches

  const labels = []
  const percents = []
  const intervals = []
  for (const row of rows) {
    labels.push(ARCHETYPE_NAMES[row.archetype])
    if (row.matches === 0) {
      percents.push(null)
      intervals.push(null)
    } else {
      percents.push(row.percent)
      intervals.push([row.percent_low, row.percent_high])
    }
  }

  // tooltipLabel describes the hovered archetype's matches.
  const tooltipLabel = (ctx) => {
    const row = rows[ctx.dataIndex]
    if (ctx.datasetIndex === 0) {
      return `${row.close} of ${row.matches} matches went to three games`
    }
    return `Interval: ${row.percent_low}% to ${row.percent_high}%`
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { min: 0, max: 100, title: { display: true, text: "% of matches that went to three games" } },
    },
    plugins: {
      title: titleOptions("Close matches by archetype"),
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), { callbacks: { label: tooltipLabel } }),
    },
  }

  const data = {
    labels,
    datasets: [
      pointDataset("Close matches", percents),
      intervalDataset("Interval", intervals),
    ],
  }

  return (
    <div className="stats-widget-chart">
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  )
}
