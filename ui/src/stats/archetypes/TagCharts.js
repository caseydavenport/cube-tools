// The chart of tags over time. The code calls tags "micro archetypes".

import { ARCHETYPES_COPY } from "./copy.js"
import React from 'react'
import { MinWinningPctDecks, Pct } from "../../utils/Utils.js"
import { bucketXScale } from "../../utils/Buckets.js"
import { Line } from 'react-chartjs-2'
import { seriesColor } from "../../theme/chartTheme.js"
import { macroArchetypes, watermark } from "./archetypeHelpers.js"
import "../stats.css"

export function MicroArchetypesChart(input) {
  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of input.parsed.archetypeBuckets) {
    labels.push(bucket.start)
  }

  // Parse the buckets. First, build up all of the archetypes we're going to display,
  // leaving out macro archetypes, as these plots are specifically about micro archetypes.
  let archSet = new Map()
  for (let bucket of input.parsed.archetypeBuckets) {
    for (let a of bucket.archetypeData.keys()) {
      if (!macroArchetypes.has(a)) {
        archSet.set(a, true)
      }
    }
  }

  // We want to fitler out any archtetypes that don't meet a minimum
  // criteria, in order to de-clutter the plots. Use aggregate data across all buckets
  // to determine the play rate, and delete any archetypes that don't meet the criteria
  // before doing per-bucket analysis below.
  input.parsed.archetypeData.forEach((data, arch) => {
    if (data.build_percent <= watermark) {
      archSet.delete(arch)
    }
  })

  // Initialize datasets for each filtered-in archetype.
  let archs = [...archSet.keys()]
  let datasets = new Map()
  for (let arch of archs) {
    datasets.set(arch, [])
  }

  for (let bucket of input.parsed.archetypeBuckets) {
    let stats = bucket.archetypeData
    for (let archetype of archs) {
      let archetypeStats = stats.get(archetype)
      if (archetypeStats == null) {
        datasets.get(archetype).push(0)
        continue
      }
      if (input.dataset === "wins") {
        datasets.get(archetype).push(archetypeStats.win_percent)
      } else if (input.dataset === "cmc") {
        datasets.get(archetype).push(archetypeStats.avg_cmc)
      } else if (input.dataset === "percent_of_wins") {
        datasets.get(archetype).push(archetypeStats.percent_of_wins)
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

  let chartDataset = []
  let index = 0
  for (let [arch, data] of datasets) {
    chartDataset.push({
      label: arch,
      data: data,
      borderColor: seriesColor(index),
      backgroundColor: seriesColor(index),
    })
    index += 1
  }

  let title = ARCHETYPES_COPY.tagCharts.buildRateTitle({ bucketSize: input.bucketSize })
  switch (input.dataset) {
    case "wins":
      title = ARCHETYPES_COPY.tagCharts.winRateTitle({ bucketSize: input.bucketSize })
      break;
    case "cmc":
      title = ARCHETYPES_COPY.tagCharts.avgManaValueTitle({ bucketSize: input.bucketSize })
      break
    case "percent_of_wins":
      title = ARCHETYPES_COPY.tagCharts.percentOfWinsTitle({ bucketSize: input.bucketSize })
      break;
    case "winning_pct":
      title = ARCHETYPES_COPY.tagCharts.winningPctTitle({ bucketSize: input.bucketSize })
      break;
    case "trophy_pct":
      title = ARCHETYPES_COPY.tagCharts.trophyPctTitle({ bucketSize: input.bucketSize })
      break;
    case "lastplace_pct":
      title = ARCHETYPES_COPY.tagCharts.lastPlacePctTitle({ bucketSize: input.bucketSize })
      break;
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
    <div className="stats-tag-chart">
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
