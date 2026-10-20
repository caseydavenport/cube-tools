// Charts of deck shape over time: mana value, basic lands, sideboard size,
// and number of colors, plus the colors pie.

import React from 'react'
import { Red, Green, Black, White, Blue } from "../../utils/Colors.js"
import { BucketName, bucketXScale } from "../../utils/Buckets.js"
import { Line, Pie } from 'react-chartjs-2'
import { currentChartTheme, seriesColor, withAlpha } from "../../theme/chartTheme.js"
import { average, inDeckColor, inSideboardColor } from "./deckChartHelpers.js"
import { DECKSTATS_COPY } from "./copy.js"

export function DeckManaValueChart(input) {
  let buckets = input.parsed.deckBuckets

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
  }

  // Parse the buckets into color data.
  let manaValues = []
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Calculate the average CMC of this bucket. Pool-only decks (empty
    // mainboard) are excluded from both numerator and denominator - we don't
    // know their built-deck CMC.
    let total = 0
    let count = 0
    for (let deck of decks) {
      if (!deck.mainboard || deck.mainboard.length == 0) {
        continue
      }
      total += deck.avg_cmc
      count++
    }
    manaValues.push(count > 0 ? total / count : 0)
  }

  let dataset = [
      {
        label: DECKSTATS_COPY.shapeCharts.manaValueSeries,
        data: manaValues,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.shapeCharts.manaValueTitle(input.parsed.bucketSize),
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
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function DeckBasicLandCountChart(input) {
  let buckets = input.parsed.deckBuckets

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
  }

  // Parse the buckets into color data.
  let lands = new Map()
  lands.set("Plains", new Array())
  lands.set("Island", new Array())
  lands.set("Mountain", new Array())
  lands.set("Swamp", new Array())
  lands.set("Forest", new Array())
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Calculate the average number of basics per built deck in this bucket.
    // Pool-only decks (empty mainboard) don't know their basic count and are
    // excluded from both numerator and denominator.
    let builtDeckCount = 0
    for (let deck of decks) {
      if (deck.mainboard && deck.mainboard.length > 0) {
        builtDeckCount++
      }
    }
    for (let [landName, values] of lands) {
      let total = 0
      for (let deck of decks) {
        if (!deck.mainboard || deck.mainboard.length == 0) {
          continue
        }
        for (let card of deck.mainboard) {
          switch (card.name) {
            case landName:
              total += 1
          }
        }
      }
      values.push(builtDeckCount > 0 ? total / builtDeckCount : 0)
    }
  }

  let dataset = [
      {
        label: DECKSTATS_COPY.shapeCharts.plainsSeries,
        data: lands.get("Plains"),
        borderColor: White,
        backgroundColor: White,
      },
      {
        label: DECKSTATS_COPY.shapeCharts.islandsSeries,
        data: lands.get("Island"),
        borderColor: Blue,
        backgroundColor: Blue,
      },
      {
        label: DECKSTATS_COPY.shapeCharts.swampsSeries,
        data: lands.get("Swamp"),
        borderColor: Black,
        backgroundColor: Black,
      },
      {
        label: DECKSTATS_COPY.shapeCharts.mountainsSeries,
        data: lands.get("Mountain"),
        borderColor: Red,
        backgroundColor: Red,
      },
      {
        label: DECKSTATS_COPY.shapeCharts.forestsSeries,
        data: lands.get("Forest"),
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
        text: DECKSTATS_COPY.shapeCharts.basicsTitle(input.parsed.bucketSize),
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
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function SideboardSizeOverTimeChart(input) {
  let buckets = input.parsed.deckBuckets

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
  }

  let sizes = []
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Not every deck has a sideboard recorded. Ignore those.
    let numDecks = 0

    // Calculate the average value for this bucket.
    let total = 0
    for (let deck of decks) {
      if (!deck.sideboard || deck.sideboard.length == 0) {
        continue
      }

      total += deck.sideboard.length
      numDecks += 1
    }
    sizes.push(average(total, numDecks))
  }

  let dataset = [
      {
        label: DECKSTATS_COPY.shapeCharts.sideboardSeries,
        data: sizes,
        borderColor: inSideboardColor,
        backgroundColor: inSideboardColor,
      },
  ]

  // Find the minimum Y value, to set the scale appropriately.
  let minY = 10
  for (let v of sizes) {
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
        text: DECKSTATS_COPY.shapeCharts.sideboardTitle(input.parsed.bucketSize),
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
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function NumColorsOverTimeChart(input) {
  let buckets = input.parsed.deckBuckets

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
  }

  let sizes = []
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    let numDecks = 0

    // Calculate the average value for this bucket.
    let total = 0
    for (let deck of decks) {
      if (deck.colors.length == 0) {
        continue
      }

      total += deck.colors.length
      numDecks += 1
    }
    sizes.push(average(total, numDecks))
  }

  let dataset = [
      {
        label: DECKSTATS_COPY.shapeCharts.numColorsSeries,
        data: sizes,
        borderColor: inDeckColor,
        backgroundColor: inDeckColor,
      },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 2, max: 3}},
    plugins: {
      title: {
        display: true,
        text: DECKSTATS_COPY.shapeCharts.numColorsTitle(input.parsed.bucketSize),
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
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

export function NumColorsPieChart(input) {
  let title = DECKSTATS_COPY.shapeCharts.pieTitle
  let graphData = [0, 0, 0, 0, 0]
  let labels = ["1", "2", "3", "4", "5"]

  // Go through each deck, and count the number of colors, incrementing
  // the corresponding data entry.
  for (let deck of input.decks) {
    if (deck.colors.length == 0) {
      continue
    }
    let idx = deck.colors.length - 1
    graphData[idx] += 1
  }

  let data = {
    labels: labels,
    datasets: [
      {
        label: title,
        data: graphData,
        backgroundColor: graphData.map((_, i) => withAlpha(seriesColor(i), 0.35)),
        borderColor: graphData.map((_, i) => seriesColor(i)),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
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

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Pie height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
