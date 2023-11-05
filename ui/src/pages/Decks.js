import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { Wins, Losses } from "../utils/Deck.js"

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
          <WinsByCreatureDensity decks={input.decks} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByNonBasicDensity decks={input.decks} />
        </td>
        <td style={{"vertical-align": "top"}}>
          <WinsByOracleText decks={input.decks} />
        </td>
      </tr>

      <tr style={{"height": "300px"}}>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <WinsByNumberOfColors decks={input.decks} />
        </td>
        <td style={{"vertical-align": "top"}}>
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
    let cmc = Math.ceil(2 * deck.avg_cmc) / 2
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


  const data = {
    labels,
    datasets: [
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

function WinsByCreatureDensity(input) {
  // Go through all the decks, and build up a map of wins by averge num
  // of the deck. We round num to create buckets.
  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    // Count the number of creatures in this deck.
    let num = 0
    for (let card of deck.mainboard) {
      if (card.types.includes("Creature")) {
        num += 1
      }
    }

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
        text: "Wins by # creatures",
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

  const data = {
    labels,
    datasets: [
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
  for (let deck of input.decks) {
    let num = 0
    for (let card of deck.mainboard) {
      if (card.types.includes("Land") && !card.types.includes("Basic")) {
        num += 1
      }
    }

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

  const labels = [...wins.keys()].sort(function(a, b) {return a - b})
  let winsData= []
  for (let l of labels) {
    winsData.push(wins.get(l))
  }
  let lossData = []
  for (let l of labels) {
    lossData.push(losses.get(l))
  }

  const data = {
    labels,
    datasets: [
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
  let matches = ["Destroy target", "Exile target", "destroy target", "exile target"]

  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    let num = 0
    for (let card of deck.mainboard) {
      for (let match of matches) {
        if (card.oracle_text.includes(match)){
          num += 1
          break
        }
      }
    }

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
        text: "Wins by # removal spells",
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

  const data = {
    labels,
    datasets: [
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
    if (num == 0) {
      console.log(deck)
    }

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

  const data = {
    labels,
    datasets: [
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
