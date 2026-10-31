// The package page's chart of how often the package was built, draft by draft.

import React from "react"
import { Line } from "react-chartjs-2"
import { CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip } from "chart.js"
import { useComputedColorScheme } from "@mantine/core"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { chartTooltip, currentChartTheme, seriesColor, withAlpha } from "../theme/chartTheme.js"
import { chartSeries } from "./packagePageModel.js"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

// OUT_OF_RANGE_ALPHA fades the drafts outside the date range.
const OUT_OF_RANGE_ALPHA = 0.3

// pointColors gives each draft's point its color, faded outside the range.
function pointColors(color, inRange, alpha) {
  return inRange.map(inside => {
    if (inside) {
      return withAlpha(color, alpha)
    }
    return withAlpha(color, alpha * OUT_OF_RANGE_ALPHA)
  })
}

// yearMonth labels an x tick with its draft's year and month. Chart.js calls
// it with the tick's index and the scale as this, so it's a plain function.
function yearMonth(value) {
  return this.getLabelForValue(value).slice(0, 7)
}

// BuiltOverTime draws the build rate per draft: a line smoothed over the last
// five drafts, and each draft's own rate as faint dots.
export function BuiltOverTime({ overTime }) {
  // Reading the scheme re-renders the chart in the new colors on a switch.
  useComputedColorScheme("light")
  const theme = currentChartTheme()
  if (overTime.length === 0) {
    return null
  }

  const series = chartSeries(overTime)
  const color = seriesColor(0)
  const data = {
    labels: series.labels,
    datasets: [
      {
        label: "Last 5 drafts",
        data: series.smoothed,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        segment: {
          borderColor: ctx => (series.inRange[ctx.p1DataIndex] ? color : withAlpha(color, OUT_OF_RANGE_ALPHA)),
        },
        tension: 0.3,
      },
      {
        label: "This draft",
        data: series.raw,
        showLine: false,
        pointRadius: 3,
        pointBackgroundColor: pointColors(color, series.inRange, 0.35),
        pointBorderWidth: 0,
      },
    ],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: theme.muted, maxTicksLimit: 6, maxRotation: 0, callback: yearMonth }, grid: { display: false } },
      y: { min: 0, max: 100, ticks: { color: theme.muted, callback: v => `${v}%` }, grid: { color: theme.grid } },
    },
    plugins: {
      legend: { display: false },
      tooltip: chartTooltip(theme, { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%` } }),
    },
  }

  const title = (
    <HoverInfo title="Built over time" info="Share of decks that built it in each draft, as dots, and over the last five drafts, as a line. Drafts outside the date range are faded.">
      <span>Built over time</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      <div className="package-chart">
        <Line data={data} options={options} />
      </div>
    </SectionCard>
  )
}
