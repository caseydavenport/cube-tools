// The Colors charts: how often each color group is built over time, and each
// group's win rate against the cube average.

import React from 'react'
import { Colors, CUBE_AVG_WIN_PERCENT, guildColor } from "../../utils/Colors.js"
import { bucketXScale } from "../../utils/Buckets.js"
import { Line, Bar } from 'react-chartjs-2'
import { chartTooltip, currentChartTheme, deltaFill, withAlpha, zeroLineGrid } from "../../theme/chartTheme.js"
import { winRateMuted } from "../../components/kit/winRate.js"
import { colorName } from "../../utils/colorNames.js"
import { intervalDataset } from "../deckstats/deckChartHelpers.js"
import { colorIsDisplayed } from "./ColorStatsTable.js"
import { seriesFor } from "./colorTrendModel.js"
import { COLORS_COPY } from "./copy.js"
import "../stats.css"

// selectedColorRows returns the color rows for the chosen time bucket, or all
// time for "ALL", so the charts and the table always agree.
export function selectedColorRows(colorData, buckets, selectedBucket) {
  if (buckets.length > 0 && selectedBucket !== "ALL") {
    for (const bucket of buckets) {
      if (bucket.name === selectedBucket) {
        return Object.values(bucket.data)
      }
    }
  }
  return Array.from(colorData.values())
}

// deltaRows are the net performance chart's bars, one per shown color group,
// best first: the Bayes win rate's distance from 50% and the raw rate's
// interval, both as distances from 50%.
function deltaRows(colorRows, colorType) {
  const rows = []
  for (const d of colorRows) {
    if (!colorIsDisplayed(d.color, colorType)) {
      continue
    }
    if (d.wins + d.losses + (d.draws || 0) === 0) {
      continue
    }
    rows.push({
      color: d.color,
      delta: d.bayesian_win_percent - CUBE_AVG_WIN_PERCENT,
      low: d.win_percent_low - CUBE_AVG_WIN_PERCENT,
      high: d.win_percent_high - CUBE_AVG_WIN_PERCENT,
      muted: winRateMuted(d),
      winPercent: d.win_percent,
      numDecks: d.num_decks,
    })
  }
  rows.sort((a, b) => b.delta - a.delta)
  return rows
}

// deltaBarColor colors a net performance bar: good or bad when its interval
// leaves out 50%, grey when the result can't be told apart from a coin flip.
function deltaBarColor(row) {
  if (row.muted) {
    return withAlpha(currentChartTheme().muted, 0.45)
  }
  return deltaFill(row.delta)
}

// ColorPerformanceDeltaChart shows each color group's Bayes win rate minus
// 50%, with the raw rate's interval as a whisker. Bars whose interval crosses
// 50% are grey: most colors can't be told apart from a coin flip.
export function ColorPerformanceDeltaChart(input) {
  if (input == null || input.colorData == null) {
    return null
  }

  const colorRows = selectedColorRows(input.colorData, input.parsed.colorDataBucketed, input.selectedBucket)
  const rows = deltaRows(colorRows, input.colorTypeSelection)
  if (rows.length === 0) {
    return null
  }

  const bars = {
    label: COLORS_COPY.rateCharts.deltaDatasetLabel,
    data: rows.map(r => r.delta),
    backgroundColor: ctx => deltaBarColor(rows[ctx.dataIndex]),
    borderWidth: 0,
    order: 3,
  }
  const whiskers = intervalDataset(COLORS_COPY.rateCharts.intervalLabel, rows.map(r => [r.low, r.high]))

  // tooltipLine reads "+2.1 pts Bayes (raw 54%, 31 decks)" for the bar and
  // the interval's ends for the whisker.
  function tooltipLine(ctx) {
    const r = rows[ctx.dataIndex]
    if (ctx.datasetIndex === 1) {
      return COLORS_COPY.rateCharts.intervalTooltip({ low: Math.round(r.low + 50), high: Math.round(r.high + 50) })
    }
    const sign = r.delta >= 0 ? "+" : ""
    return COLORS_COPY.rateCharts.deltaTooltip({ sign, delta: r.delta.toFixed(1), winPercent: r.winPercent.toFixed(0), numDecks: r.numDecks })
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: true, text: COLORS_COPY.rateCharts.deltaTitle, font: { size: "16pt" } },
      subtitle: { display: true, text: COLORS_COPY.rateCharts.deltaSubtitle },
      legend: { display: false },
      tooltip: chartTooltip(currentChartTheme(), { callbacks: { label: tooltipLine } }),
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

  const data = { labels: rows.map(r => colorName(r.color)), datasets: [bars, whiskers] }
  return (
    <div className="chart-container">
      <div className="colors-rate-chart">
        <Bar options={options} data={data} />
      </div>
    </div>
  )
}

// lineColor is a color group's line color: its own color for one color, its
// guild or shard color for more.
function lineColor(group) {
  if (group.length === 1) {
    return Colors.get(group)
  }
  return guildColor(group)
}

// ColorTrendChart draws one line per group in groups: the chosen measure in
// each time bucket of bucketSize drafts.
export function ColorTrendChart({ buckets, groups, measure, bucketSize }) {
  const labels = buckets.map(bucket => bucket.start)
  const datasets = groups.map(group => ({
    label: colorName(group),
    data: seriesFor(buckets, group, measure),
    borderColor: lineColor(group),
    backgroundColor: lineColor(group),
    hoverBorderWidth: 4,
    spanGaps: false,
  }))

  const options = {
    responsive: true,
    borderWidth: 3,
    maintainAspectRatio: false,
    scales: { x: bucketXScale, y: { min: 0 } },
    hover: { mode: 'dataset' },
    elements: { point: { hitRadius: 10 } },
    plugins: {
      subtitle: { display: true, text: COLORS_COPY.rateCharts.bucketCaption(bucketSize) },
      legend: { labels: { font: { size: "16pt" } } },
    },
  }

  return (
    <div className="stats-main-chart">
      <Line height={"300px"} options={options} data={{ labels, datasets }} />
    </div>
  )
}
