// Charts of what the cards in decks do, by color and over time.

import React from 'react'
import { Red, Green, Black, White, Blue } from "../../utils/Colors.js"
import { bucketXScale } from "../../utils/Buckets.js"
import { Line } from 'react-chartjs-2'
import { hasData } from "../../utils/dataKinds.js"
import { CounterspellMatches, RemovalMatches } from "../../utils/cardMatches.js"
import { inDeckColor, inSideboardColor } from "./deckChartHelpers.js"
import { DECKSTATS_COPY } from "./copy.js"
import "../stats.css"

export function OracleTextByColor(input) {

  const labels = input.data.labels

  let valuesByColor = input.data.bucketed.interaction.mb.byColor

  let dataset = [
      {
        label: DECKSTATS_COPY.oracleText.whiteSeries,
        data: valuesByColor.get("W"),
        borderColor: White,
        backgroundColor: White,
      },
      {
        label: DECKSTATS_COPY.oracleText.blueSeries,
        data: valuesByColor.get("U"),
        borderColor: Blue,
        backgroundColor: Blue,
      },
      {
        label: DECKSTATS_COPY.oracleText.blackSeries,
        data: valuesByColor.get("B"),
        borderColor: Black,
        backgroundColor: Black,
      },
      {
        label: DECKSTATS_COPY.oracleText.redSeries,
        data: valuesByColor.get("R"),
        borderColor: Red,
        backgroundColor: Red,
      },
      {
        label: DECKSTATS_COPY.oracleText.greenSeries,
        data: valuesByColor.get("G"),
        borderColor: Green,
        backgroundColor: Green,
      },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.oracleText.titleWithBucketSize(input.title, input.parsed.bucketSize),
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
    <div className="stats-widget-chart">
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function OracleTextOverTimeChart(input) {

  let mbValues = []
  let sbValues = []
  if (input.matches == RemovalMatches) {
    mbValues = input.data.bucketed.removal.mb.count
    sbValues = input.data.bucketed.removal.sb.count
  } else if (input.matches == CounterspellMatches) {
    mbValues = input.data.bucketed.mbCounterspells
    sbValues = input.data.bucketed.sbCounterspells
  }

  let dataset = [
      {
        label: DECKSTATS_COPY.oracleText.perDeckSeries,
        data: mbValues,
        borderColor: inDeckColor,
        backgroundColor: inDeckColor,
      },
  ]

  // The sideboard line needs sideboards, which some cubes don't record.
  if (hasData(input.info, "sideboards")) {
    dataset.push({
      label: DECKSTATS_COPY.oracleText.perSideboardSeries,
      data: sbValues,
      borderColor: inSideboardColor,
      backgroundColor: inSideboardColor,
    })
  }

  // Find the minimum Y value, to set the scale appropriately.
  let minY = 10
  for (let v of mbValues) {
    if (v < minY) {
      minY = v
    }
  }
  for (let v of sbValues) {
    if (v < minY) {
      minY = v
    }
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: minY}},
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.oracleText.titleWithBucketSize(input.title, input.parsed.bucketSize),
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

  const labels = input.data.labels
  const data = {labels, datasets: dataset};
  return (
    <div className="stats-widget-chart">
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function ManaCostByOracleTextOverTime(input) {

  const labels = input.data.labels

  let mbValues = input.data.bucketed.removal.mb.cmc
  let sbValues = input.data.bucketed.removal.sb.cmc

  let dataset = [
      {
        label: DECKSTATS_COPY.oracleText.inDeckSeries,
        data: mbValues,
        borderColor: inDeckColor,
        backgroundColor: inDeckColor,
      },
  ]

  // The sideboard line needs sideboards, which some cubes don't record.
  if (hasData(input.info, "sideboards")) {
    dataset.push({
      label: DECKSTATS_COPY.oracleText.inSideboardSeries,
      data: sbValues,
      borderColor: inSideboardColor,
      backgroundColor: inSideboardColor,
    })
  }

  // Find the minimum Y value, to set the scale appropriately.
  let minY = 10
  for (let v of mbValues) {
    if (v < minY) {
      minY = v
    }
  }
  for (let v of sbValues) {
    if (v < minY) {
      minY = v
    }
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: minY}},
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.oracleText.titleWithBucketSize(input.title, input.parsed.bucketSize),
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
    <div className="stats-widget-chart">
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
