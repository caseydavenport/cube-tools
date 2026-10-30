// The Removal page's scatter: each spot-removal card as a point at its
// effective cost (x) and the share of creatures it can kill (y), so cheap,
// wide-reaching removal sits top left.

import React, { useEffect, useState } from "react"
import { useComputedColorScheme } from "@mantine/core"
import { Chart as ChartJS, Legend, LinearScale, PointElement, Tooltip } from "chart.js"
import { Scatter } from "react-chartjs-2"
import { chartTooltip, currentChartTheme } from "../theme/chartTheme.js"
import { MULTICOLOR } from "../theme/tokens.js"
import { scatterSeries } from "./scatterPoints.js"

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

// SYMBOL_SIZE is the width and height, in pixels, of a mana symbol point.
const SYMBOL_SIZE = 18

// GROUP_LABELS name each color group in the legend.
const GROUP_LABELS = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  multi: "Multicolor",
  colorless: "Colorless",
}

// SYMBOL_FILES are the mana symbol images that mark one-color cards. The
// colors alone are too close to tell apart for some readers, so the symbol
// carries the color too.
const SYMBOL_FILES = {
  W: "img/plains.png",
  U: "img/island.png",
  B: "img/swamp.png",
  R: "img/mountain.png",
  G: "img/forest.png",
}

// symbolImages loads each mana symbol once, for every scatter on the page.
const symbolImages = {}
for (const [group, file] of Object.entries(SYMBOL_FILES)) {
  const image = new Image(SYMBOL_SIZE, SYMBOL_SIZE)
  image.src = file
  symbolImages[group] = image
}

// useSymbolsLoaded re-renders once every symbol image has loaded, since a
// chart drawn before then would show blank points.
function useSymbolsLoaded() {
  const [, setLoaded] = useState(0)
  useEffect(() => {
    for (const image of Object.values(symbolImages)) {
      if (!image.complete) {
        image.onload = () => setLoaded(count => count + 1)
      }
    }
  }, [])
}

// dataset turns one color group's series into a Chart.js dataset: mana
// symbols for one color, a ringed dot for multicolor and colorless.
function dataset(series, theme) {
  // clip lets a point at 100% draw past the top edge instead of being cut in half.
  const base = { label: GROUP_LABELS[series.group], data: series.points, clip: SYMBOL_SIZE }
  if (symbolImages[series.group]) {
    return { ...base, pointStyle: symbolImages[series.group], pointRadius: SYMBOL_SIZE / 2, pointHoverRadius: SYMBOL_SIZE / 2 + 2 }
  }

  let fill = theme.muted
  if (series.group === "multi") {
    fill = MULTICOLOR
  }
  return {
    ...base,
    pointStyle: "circle",
    pointRadius: 8,
    pointHoverRadius: 10,
    backgroundColor: fill,
    borderColor: theme.card,
    borderWidth: 2,
  }
}

// RemovalScatter draws the cards' coverage against their effective cost.
// mode "played" plots play-weighted coverage; otherwise raw coverage.
export function RemovalScatter({ cards, mode }) {
  useComputedColorScheme("light")
  useSymbolsLoaded()
  const theme = currentChartTheme()

  const data = { datasets: scatterSeries(cards, mode).map(series => dataset(series, theme)) }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: SYMBOL_SIZE / 2 } },
    scales: {
      x: {
        title: { display: true, text: "Effective cost", color: theme.text },
        ticks: { stepSize: 1, color: theme.muted },
        grid: { color: theme.grid },
      },
      y: {
        title: { display: true, text: "Coverage (% of creatures)", color: theme.text },
        min: 0,
        max: 100,
        ticks: { color: theme.muted },
        grid: { color: theme.grid },
      },
    },
    plugins: {
      legend: { labels: { usePointStyle: true, color: theme.text } },
      tooltip: chartTooltip(theme, {
        callbacks: {
          title: items => items[0].raw.name,
          label: item => `Cost ${item.raw.cost} · kills ${item.raw.coverage}% · ${item.raw.restriction}`,
        },
      }),
    },
  }

  return (
    <div className="removal-scatter">
      <Scatter data={data} options={options} />
    </div>
  )
}
