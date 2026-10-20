// The Trends charts for one picked card: play rate, ELO, and win rate over time.

import React from 'react'
import { hasData } from "../../utils/dataKinds.js"
import { bucketTicks, largeTicks } from "../../utils/Buckets.js"
import { Line } from 'react-chartjs-2'
import { seriesColor } from "../../theme/chartTheme.js"

export function PlayRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.cardDataBucketed

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  let name = input.selectedCard
  if (name == "") {
    return <p className="section-hint">Select a card to chart its play rate over time.</p>
  }

  var mb = []
  var sb = []
  var playableSb = []
  for (let bucket of buckets) {
    let data = new Map(Object.entries(bucket.data))
    let stats = data.get(name)
    if (stats != null) {
      mb.push(stats.mainboard_percent)
      sb.push(stats.sideboard_percent)
      playableSb.push(stats.playable_sideboard_percent)
    } else {
      // Player was not in this bucket.
      mb.push(null)
      sb.push(null)
      playableSb.push(null)
    }
  }

  let dataset = [
      {
        label: 'Mainboard %',
        data: mb,
        borderColor: seriesColor(0),
        backgroundColor: seriesColor(0),
      },
  ]

  // The sideboard lines need sideboards, which some cubes don't record.
  if (hasData(input.info, "sideboards")) {
    dataset.push({
      label: 'Sideboard %',
      data: sb,
      borderColor: seriesColor(2),
      backgroundColor: seriesColor(2),
    })
    dataset.push({
      label: 'Playable sb %',
      data: playableSb,
      borderColor: seriesColor(3),
      backgroundColor: seriesColor(3),
    })
  }


  let title = `${name} % (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: largeTicks,
        title: {display: true, text: "Pick %", font: {size: 20, weight: "bold"}},
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}},
        ticks: bucketTicks,
      },
    },
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

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container" align="center">
      <div align="center" className="stats-chart stats-chart-tall">
        <Line className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

export function ELOChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.cardDataBucketed

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  let name = input.selectedCard
  if (name == "") {
    return <p className="section-hint">Select a card to chart its ELO over time.</p>
  }

  let min = 850
  let max = 1450

  var elo = []
  for (let bucket of buckets) {
    let data = new Map(Object.entries(bucket.data))
    let stats = data.get(name)
    if (stats != null) {
      if (stats.elo > max) {
        max = stats.elo
      }
      if (stats.elo < min) {
        min = stats.elo
      }
      elo.push(stats.elo)
    } else {
      // Player was not in this bucket.
      elo.push(null)
    }
  }

  let dataset = [
      {
        label: 'ELO',
        data: elo,
        borderColor: seriesColor(6),
        backgroundColor: seriesColor(6),
      },
  ]


  let title = `${name} ELO (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        title: {display: true, text: "Pick ELO", font: {size: 20, weight: "bold"}},
        min: min-50,
        max: max+50,
        ticks: largeTicks,
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}},
        ticks: bucketTicks,
      },
    },
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

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container" align="center">
      <div align="center" className="stats-chart stats-chart-tall">
        <Line className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

export function WinrateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.cardDataBucketed

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket.start)
  }

  let name = input.selectedCard
  if (name == "") {
    return <p className="section-hint">Select a card to chart its win rate over time.</p>
  }

  var wins = []
  var pows = []
  for (let bucket of buckets) {
    let data = new Map(Object.entries(bucket.data))
    let card = data.get(name)
    if (card != null && card.mainboard_percent > 0) {
      wins.push(card.win_percent)

      // Determine % of wins that involved this card from within this bucket.
      // This is the total number of wins with this card, divided by the total number of
      // wins in the bucket.
      pows.push(100 * card.wins / bucket.games)
    } else {
      // Card was not in this bucket.
      wins.push(null)
      pows.push(null)
    }
  }

  let dataset = [
      {
        label: 'Win %',
        data: wins,
        borderColor: seriesColor(0),
        backgroundColor: seriesColor(0),
      },
      {
        label: '% of all Wins',
        data: pows,
        borderColor: seriesColor(2),
        backgroundColor: seriesColor(2),
      },
  ]

  let title = `${name} win % (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        title: {display: true, text: "Win %", font: {size: 20, weight: "bold"}},
        min: 0,
        max: 100,
        ticks: largeTicks,
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}},
        ticks: bucketTicks,
      },
    },
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

  const data = {labels, datasets: dataset};
  return (
    <div className="chart-container" align="center">
      <div align="center" className="stats-chart stats-chart-tall">
        <Line className="chart" options={options} data={data} />
      </div>
    </div>
  );
}
