import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { Wins, Losses } from "../utils/Deck.js"
import { DeckBuckets } from "../utils/Buckets.js"

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js';
import { Line, Bar, Pie } from 'react-chartjs-2';

// Register chart JS objects that we need to use.
ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// This is imperfect, but matches most removal spells.
// Will need to keep this up to date with the cube as it evolves, or find
// a more generic way.
export const RemovalMatches = [
  "destroy target",
  "destroy up to",
  "destroy all creatures",

  "exile target creature",
  "exile target permanent",
  "exile target nonland permanent",
  "exile target artifact",
  "exile another target",
  "exile up to one target",
  "exile that card",

  "target creature gets -",
  "all creatures get -",
  "black sun's zenith",
  "-1/-1 on target",

  "put target creature into its owner",

  "to any target",
  "target creature or player",
  "target creature or planeswalker",
  "destroy target planeswalker",
  "damage divided as you choose",

  "fight",
  "target player sacrifices",
  "target permanent you don't control to",
  "target creature with flying",
  "opponent sacrifices a",
  "return target creature an opponent controls to its owner's hand",
  "return target creature to its owner's hand",
  "return target nonland permanent",
  "otawara",
  "tap target creature",
  "tap target permanent",
  "tap target nonland",
  "tap target artifact",

  "is a colorless forest",
]

export const CounterspellMatches = [
  "counter target",
  "return target spell",
]

const cardDrawMatches = [
  "draw a card",
]

const lifegainMatches = [
  "gain . life",
  "lifelink",
]

export function DeckWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <table style={{"width": "100%"}}>
      <tbody>
        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByManaCost decks={input.decks} />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <WinsByCardType type="Creature" decks={input.decks} />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByCardType type="Sorcery" decks={input.decks} />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <WinsByCardType type="Instant" decks={input.decks} />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByCardType type="Planeswalker" bucketSize={1} decks={input.decks} />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <WinsByCardType type="Enchantment" decks={input.decks} />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top"}}>
            <WinsByCardType type="Land" bucketSize={1} decks={input.decks} />
          </td>

          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByNonBasicDensity decks={input.decks} />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByNumberOfColors decks={input.decks} />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <DeckManaValueChart decks={input.decks} bucketSize={input.bucketSize} />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByOracleText
              title="Wins by # counterspells"
              decks={input.decks}
              matches={CounterspellMatches}
            />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <WinsByOracleText
              title="Wins by # removal spells"
              decks={input.decks}
              matches={RemovalMatches}
            />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByOracleText
              title="Wins by # card draw spells"
              decks={input.decks}
              matches={cardDrawMatches}
            />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <WinsByOracleText
              title="Wins by # lifegain spells"
              decks={input.decks}
              matches={lifegainMatches}
            />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <WinsByOracleText
              title="Wins by graveyard interaction"
              decks={input.decks}
              matches={["graveyard"]}
            />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <WinsByOracleText
              title="Wins by # discard spells"
              decks={input.decks}
              matches={["discard"]}
            />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top"}} colSpan="2">
            <DeckBasicLandCountChart decks={input.decks} bucketSize={input.bucketSize} />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <OracleTextOverTimeChart
              title="Avg. removal per-deck"
              decks={input.decks}
              bucketSize={input.bucketSize}
              matches={RemovalMatches}
            />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <OracleTextOverTimeChart
              title="Avg. counterspells per-deck"
              decks={input.decks}
              bucketSize={input.bucketSize}
              matches={CounterspellMatches}
            />
          </td>
        </tr>

        <tr style={{"height": "300px"}}>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <SideboardSizeOverTimeChart decks={input.decks} bucketSize={input.bucketSize} />
          </td>
          <td style={{"verticalAlign": "top"}}>
            <OracleTextByColor
              title="Interaction by color"
              decks={input.decks}
              matches={RemovalMatches.concat(CounterspellMatches)}
              bucketSize={input.bucketSize}
            />
          </td>
        </tr>

      </tbody>
    </table>

  )
}

function WinsByManaCost(input) {
  // Go through all the decks, and build up a map of wins by averge CMC
  // of the deck. We round CMC to create buckets.
  let winsByCMC = new Map()
  let lossesByCMC = new Map()
  for (let deck of input.decks) {
    let cmc = Math.round(4 * deck.avg_cmc) / 4
    if (!winsByCMC.has(cmc)) {
      winsByCMC.set(cmc, 0)
      lossesByCMC.set(cmc, 0)
    }
    winsByCMC.set(cmc, winsByCMC.get(cmc) + Wins(deck))
    lossesByCMC.set(cmc, lossesByCMC.get(cmc) + Losses(deck))
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: "Wins by CMC",
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const labels = [...winsByCMC.keys()].sort()
  let winsData= []
  for (let l of labels) {
    winsData.push(winsByCMC.get(l))
  }
  let lossData = []
  for (let l of labels) {
    lossData.push(lossesByCMC.get(l))
  }
  let percentages = []
  for (let l of labels) {
    percentages.push(Math.round(100 * winsByCMC.get(l) / (winsByCMC.get(l) + lossesByCMC.get(l))))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: '#Fa7',
      },
    ],
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}

function WinsByCardType(input) {
  // Go through all the decks, and build up a map of wins by averge num
  // of the deck. We round num to create buckets.
  let wins = new Map()
  let losses = new Map()
  let bucketSize = 3
  if (input.bucketSize != null) {
    bucketSize = input.bucketSize
  }
  for (let deck of input.decks) {
    // Count the number of creatures in this deck.
    let num = 0
    for (let card of deck.mainboard) {
      if (card.types.includes(input.type)) {
        num += 1
      }
    }

    // Create buckets of creature amounts and put this into it.
    let bucket = Math.round(num/bucketSize) * bucketSize
    if (!wins.has(bucket)) {
      wins.set(bucket, 0)
      losses.set(bucket, 0)
    }
    wins.set(bucket, wins.get(bucket) + Wins(deck))
    losses.set(bucket, losses.get(bucket) + Losses(deck))
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: "Wins by # " + input.type,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const sorted = [...wins.keys()].sort(function(a, b) {return a - b})
  var labels = []
  for (let start of sorted) {
    if (bucketSize == 1) {
      labels.push(`${start}`)
    } else {
      labels.push(`${start}-${start+bucketSize}`)
    }
  }
  let winsData= []
  for (let l of sorted ) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of sorted) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of sorted) {
    percentages.push(Math.round(100 * wins.get(l) / (wins.get(l) + losses.get(l))))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: '#Fa7',
      },

    ],
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}

function WinsByNonBasicDensity(input) {
  let wins = new Map()
  let losses = new Map()
  let bucketSize = 2
  for (let deck of input.decks) {
    let num = 0
    for (let card of deck.mainboard) {
      if (card.types.includes("Land") && !card.types.includes("Basic")) {
        num += 1
      }
    }

    let bucket = Math.round(num/bucketSize) * bucketSize
    if (!wins.has(bucket)) {
      wins.set(bucket, 0)
      losses.set(bucket, 0)
    }
    wins.set(bucket, wins.get(bucket) + Wins(deck))
    losses.set(bucket, losses.get(bucket) + Losses(deck))
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: "Wins by # nonbasic",
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const sorted = [...wins.keys()].sort(function(a, b) {return a - b})
  let labels = []
  for (let start of sorted) {
    labels.push(`${start}-${start+bucketSize}`)
  }
  let winsData= []
  for (let l of sorted) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of sorted) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of sorted) {
    percentages.push(Math.round(100 * wins.get(l) / (wins.get(l) + losses.get(l))))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: '#Fa7',
      },

    ],
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}

function WinsByOracleText(input) {
  let bucketSize = 3
  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    let num = 0
    for (let card of deck.mainboard) {
      for (let match of input.matches) {
        if (card.oracle_text.toLowerCase().match(match)){
          num += 1
          break
        }
      }
    }

    let bucket = Math.round(num/bucketSize)*bucketSize
    if (!wins.has(bucket)) {
      wins.set(bucket, 0)
      losses.set(bucket, 0)
    }
    wins.set(bucket, wins.get(bucket) + Wins(deck))
    losses.set(bucket, losses.get(bucket) + Losses(deck))
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: input.title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const sorted = [...wins.keys()].sort(function(a, b) {return a - b})
  let labels = []
  for (let start of sorted) {
    labels.push(`${start}-${start+bucketSize}`)
  }
  let winsData= []
  for (let l of sorted) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of sorted) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of sorted) {
    percentages.push(Math.round(100 * wins.get(l) / (wins.get(l) + losses.get(l))))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: '#Fa7',
      },

    ],
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}

function WinsByNumberOfColors(input) {
  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    let num = deck.colors.length

    if (!wins.has(num)) {
      wins.set(num, 0)
      losses.set(num, 0)
    }
    wins.set(num, wins.get(num) + Wins(deck))
    losses.set(num, losses.get(num) + Losses(deck))
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {stacked:true, min: 0},
      x: {stacked:true},
    },
    plugins: {
      title: {
        display: true,
        text: "Wins by # colors",
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const labels = [...wins.keys()].sort(function(a, b) {return a - b})
  let winsData= []
  for (let l of labels) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of labels) {
    lossData.push(losses.get(l))
  }
  let percentages = []
  for (let l of labels) {
    percentages.push(Math.round(100 * wins.get(l) / (wins.get(l) + losses.get(l))))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
      {
        type: "bar",
        label: 'Wins',
        data: winsData,
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        type: "bar",
        label: 'Losses',
        data: lossData,
        backgroundColor: '#Fa7',
      },
    ],
  };

  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}

function OracleTextByColor(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
  }


  let colors = ["W", "U", "B", "R", "G"]

  let valuesByColor = new Map()
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Calculate the average value for this bucket.
    let numByColor = new Map()
    for (let deck of decks) {
      for (let card of deck.mainboard) {
        for (let match of input.matches) {
          if (card.oracle_text.toLowerCase().match(match)){
            for (let color of card.colors) {
              if (!numByColor.has(color)) {
                numByColor.set(color, 0)
              }
              numByColor.set(color, numByColor.get(color) + 1)
            }
            break
          }
        }
      }
    }

    // Add this bucket's values.
    for (let color of colors) {
      if (!valuesByColor.has(color)) {
        valuesByColor.set(color, new Array())
      }
      let v = valuesByColor.get(color)
      if (numByColor.has(color)) {
        v.push(numByColor.get(color))
      } else {
        v.push(0)
      }
      valuesByColor.set(color, v)
    }
  }

  let dataset = [
      {
        label: 'W',
        data: valuesByColor.get("W"),
        borderColor: "#dce312",
        backgroundColor: "#dce312",
      },
      {
        label: 'U',
        data: valuesByColor.get("U"),
        borderColor: "#0000FF",
        backgroundColor: "#0000FF",
      },
      {
        label: 'B',
        data: valuesByColor.get("B"),
        borderColor: "#888",
        backgroundColor: "#888",
      },
      {
        label: 'R',
        data: valuesByColor.get("R"),
        borderColor: "#F00",
        backgroundColor: '#F00',
      },
      {
        label: 'G',
        data: valuesByColor.get("G"),
        borderColor: "#0F0",
        backgroundColor: '#0F0',
      },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: input.title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function OracleTextOverTimeChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
  }

  let mbValues = []
  let sbValues = []
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Calculate the average value for this bucket.
    let mbTotal = 0
    let sbTotal = 0
    for (let deck of decks) {
      for (let card of deck.mainboard) {
        for (let match of input.matches) {
          if (card.oracle_text.toLowerCase().match(match)){
            mbTotal += 1
            break
          }
        }
      }
      for (let card of deck.sideboard) {
        for (let match of input.matches) {
          if (card.oracle_text.toLowerCase().match(match)){
            sbTotal += 1
            break
          }
        }
      }
    }
    mbValues.push(mbTotal / decks.length)
    sbValues.push(sbTotal / decks.length)
  }

  let dataset = [
      {
        label: 'Avg. per-deck',
        data: mbValues,
        borderColor: "#dce312",
        backgroundColor: "#dce312",
      },
      {
        label: 'Avg. per-sideboard',
        data: sbValues,
        borderColor: "#ffaf12",
        backgroundColor: "#ecaf00",
      },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: input.title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function DeckManaValueChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
  }

  // Parse the buckets into color data.
  let mana_values = []
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Calculate the average CMC of this bucket.
    let total = 0
    for (let deck of decks) {
      total += deck.avg_cmc
    }
    mana_values.push(total / decks.length)
  }

  let dataset = [
      {
        label: 'Average Mana Value',
        data: mana_values,
        borderColor: "#dce312",
        backgroundColor: "#dce312",
      },
  ]

  let title = `Deck Avg. Mana Value (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function DeckBasicLandCountChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
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

    // Calculate the number of basics per-draft in this bucket.
    for (let [landName, values] of lands) {
      let total = 0
      for (let deck of decks) {
        for (let card of deck.mainboard) {
          switch (card.name) {
            case landName:
              total += 1
          }
        }
      }
      values.push(total / buckets[0].length)
    }
  }

  let dataset = [
      {
        label: 'Plains',
        data: lands.get("Plains"),
        borderColor: "#FFFF00",
        backgroundColor: "#FFFF00",
      },
      {
        label: 'Islands',
        data: lands.get("Island"),
        borderColor: "#0000FF",
        backgroundColor: "#0000FF",
      },
      {
        label: 'Swamps',
        data: lands.get("Swamp"),
        borderColor: "#DDDDDD",
        backgroundColor: "#DDDDDD",
      },
      {
        label: 'Mountains',
        data: lands.get("Mountain"),
        borderColor: "#FF0000",
        backgroundColor: "#FF0000",
      },
      {
        label: 'Forests',
        data: lands.get("Forest"),
        borderColor: "#00FF00",
        backgroundColor: "#00FF00",
      },
  ]

  let title = `Total basics used (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function SideboardSizeOverTimeChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.bucketSize)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
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
      if (deck.sideboard.length == 0) {
        continue
      }

      total += deck.sideboard.length
      numDecks += 1
    }
    sizes.push(total / numDecks)
  }

  let dataset = [
      {
        label: 'Avg. sideboard size',
        data: sizes,
        borderColor: "#dce312",
        backgroundColor: "#dce312",
      },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0}},
    plugins: {
      title: {
        display: true,
        text: input.title,
        color: "#FFF",
        font: {
          size: "16pt",
        },
      },
      legend: {
        labels: {
          color: "#FFF",
          font: {
            size: "16pt",
          },
        },
      },
    },
  };

  const data = {labels, datasets: dataset};
  return (
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
