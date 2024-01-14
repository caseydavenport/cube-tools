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
const removalMatches = [
  "destroy target",
  "destroy up to",
  "destroy all creatures",

  "exile target",
  "exile another target",
  "exile up to one target",

  "target creature gets -",
  "all creatures get -",
  "black sun's zenith",

  "put target creature",

  "to any target",
  "target creature or player",
  "target creature or planeswalker",
  "destroy target planeswalker",
  "damage divided as you choose",

  "fight",
  "target player sacrifices",
  "return target creature to its owner's hand",
  "tap target",
]

const counterspellMatches = [
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
      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByManaCost decks={input.decks} />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByCardType type="Creature" decks={input.decks} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByCardType type="Sorcery" decks={input.decks} />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByCardType type="Instant" decks={input.decks} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByCardType type="Planeswalker" bucketSize={1} decks={input.decks} />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByCardType type="Enchantment" decks={input.decks} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top"}}>
          <WinsByCardType type="Land" bucketSize={1} decks={input.decks} />
        </td>

        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByNonBasicDensity decks={input.decks} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByNumberOfColors decks={input.decks} />
        </td>
        <td style={{"vertical-align": "top"}}>
          <DeckManaValueChart decks={input.decks} bucketSize={input.bucketSize} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByOracleText
            title="Wins by # counterspells"
            decks={input.decks}
            matches={counterspellMatches}
          />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByOracleText
            title="Wins by # removal spells"
            decks={input.decks}
            matches={removalMatches}
          />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByOracleText
            title="Wins by # card draw spells"
            decks={input.decks}
            matches={cardDrawMatches}
          />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByOracleText
            title="Wins by # lifegain spells"
            decks={input.decks}
            matches={lifegainMatches}
          />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByOracleText
            title="Wins by graveyard interaction"
            decks={input.decks}
            matches={["graveyard"]}
          />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByOracleText
            title="Wins by # discard spells"
            decks={input.decks}
            matches={["discard"]}
          />
        </td>
      </tr>

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
