import React from 'react'
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { DeckBuckets } from "../utils/Buckets.js"
import { GetColorIdentity } from "../utils/Colors.js"
import { Wins, Losses } from "../utils/Deck.js"
import { IsBasicLand, SortFunc } from "../utils/Utils.js"

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

// Register chart JS objects that we need to use.
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export function ColorWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <table style={{"width": "100%"}}>
      <tr>
        <td style={{"width": "50%"}}>
          <ColorStatsTable
            colorData={input.colorData}
            ddOpts={input.ddOpts}
            dropdownSelection={input.colorTypeSelection}
            decks={input.decks}
            onSelected={input.onSelected}
            onClick={input.onHeaderClick}
            sortBy={input.colorSortBy}
          />
        </td>
        <td style={{"width": "50%"}}> </td>
      </tr>

      <tr>
        <td style={{"padding-top": "50px"}}>
          <ColorRateChart
            colorData={input.colorData}
            decks={input.decks}
            dataset="builds"
          />
        </td>
        <td style={{"padding-top": "50px"}}>
          <ColorRateChart
            colorData={input.colorData}
            decks={input.decks}
            dataset="wins"
          />
        </td>
      </tr>

      <tr>
        <td style={{"padding-top": "50px"}}>
          <ColorRateChart
            colorData={input.colorData}
            decks={input.decks}
            dataset="builds"
            colorMode="dual"
          />
        </td>
        <td style={{"padding-top": "50px"}}>
          <ColorRateChart
            colorData={input.colorData}
            decks={input.decks}
            dataset="wins"
            colorMode="dual"
          />
        </td>
      </tr>

    </table>
  );
}

// ColorStatsTable displays the win percentages and records by color.
function ColorStatsTable(input) {
  if (input == null || input.colorData == null) {
    return null
  }

  // Iterate and calculate the actual win percentage for each.
  // Also, convert from a map to a list at this point so that we can
  // sort by win percentage.
  let wr = []
  for (var color in input.colorData) {
    // Add it to the list.
    wr.push(input.colorData[color])
  }

  // We conditionally show / hide a few of the columns, because they are only
  // applicable when mono-color is displayed.
  let headerStyleFields = {}
  if (input.dropdownSelection !== "Mono") {
    headerStyleFields.display = "none"
  }

  return (
    <div>
      <DropdownHeader
        label="Select color type"
        options={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={input.onSelected}
      />

      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onClick} id="color" className="header-cell">Color</td>
            <td onClick={input.onClick} id="win" className="header-cell">Deck win rate</td>
            <td onClick={input.onClick} id="build" className="header-cell">Deck build rate</td>
            <td onClick={input.onClick} id="record" className="header-cell">Record</td>
            <td onClick={input.onClick} id="decks" className="header-cell"># Decks</td>
            <td onClick={input.onClick} id="picks" className="header-cell" style={headerStyleFields}>% of mainboard picks</td>
            <td onClick={input.onClick} id="splash" className="header-cell" style={headerStyleFields}>Avg % of deck</td>
          </tr>
        </thead>
        <tbody>
          {
            wr.map(function(rates) {
              // If dual is set, only show dual colors.
              // Otherwise, only show single colors.
              // `color` here is a string made of one or more characters - e.g., W or UB.
              if (input.dropdownSelection === "Dual" && rates.color.length !== 2) {
                return
              } else if (input.dropdownSelection === "Mono" && rates.color.length !== 1 ) {
                return
              } else if (input.dropdownSelection === "Trio" && rates.color.length !== 3) {
                return
              }

              let record = rates.wins + "-" + rates.losses + "-" + 0

              // Determine what we're sorting by. Default to sorting by win percentage.
              let sort = rates.win_percent
              if (input.sortBy === "build") {
                sort = rates.build_percent
              } else if (input.sortBy === "decks") {
                sort = rates.num_decks
              } else if (input.sortBy === "color") {
                sort = rates.color
              } else if (input.sortBy === "picks") {
                sort = rates.total_pick_percentage
              } else if (input.sortBy === "splash") {
                sort = rates.average_deck_percentage
              }

              return (
                <tr key={rates.color} sort={sort} className="winrate-row">
                  <td>{rates.color}</td>
                  <td>{rates.win_percent}%</td>
                  <td>{rates.build_percent}%</td>
                  <td>{record}</td>
                  <td>{rates.num_decks}</td>
                  <td style={headerStyleFields}>{rates.total_pick_percentage}%</td>
                  <td style={headerStyleFields}>{rates.average_deck_percentage}%</td>
                </tr>
              );
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

// GetColorStats collects statistics aggregated by color and color pair based on the given decks.
export function GetColorStats(decks) {
  let tracker = {}

  // Count of all cards ever drafted. This will be used to calculate pick percentages per-color.
  let totalCards = 0

  // Function for initializing an empty color.
  let newColor = function(color) {
    return {
      color: color,
      wins: 0,
      losses: 0,
      cards: 0,

      // Each element represents a deck, with value equal to the
      // percentage of cards in that deck with this color.
      deck_percentages: [],

      // The average percentage of non-land cards in a deck that are this color.
      average_deck_percentage: 0,

      // The percentage of all drafted cards that are this color.
      total_pick_percentage: 0,

      // Win percentage of decks including this color.
      win_percent: 0,

      // Percentage of all decks that have included this color.
      build_percent: 0,

      // Total number of decks that included this color.
      num_decks: 0,
    }
  }

  for (var i in decks) {
    // Start by adding metrics at the deck scope for color identity.
    // Add wins and losses contributed for each color / color combination within this deck.
    let colors = GetColorIdentity(decks[i])
    for (var j in colors) {
      let color = colors[j]
      if (tracker[color] == null) {
        tracker[color] = newColor(color)
      }
      tracker[color].wins += Wins(decks[i])
      tracker[color].losses += Losses(decks[i])
      tracker[color].num_decks += 1
    }

    // Add metrics to the color based on card scope statistics.
    // Calculate the total number of cards drafted of the color across
    // all drafts, as well as the percentage of that color within the deck, which we'll
    // use to calculate an indicator of which colors are primary and whicn are splashed.
    let totalCardsInDeck = 0
    let cardsPerColorInDeck = {}
    for (j in decks[i].mainboard) {
      let card = decks[i].mainboard[j]

      // Skip basic lands, since they just dilute the percentages.
      if (IsBasicLand(card)) {
        continue
      }

      // TODO: This calculation excludes colorless cards, meaning percentages for colors
      // will not add up to 100%.
      totalCards += 1
      totalCardsInDeck += 1
      for (var k in card.colors) { // TODO: Include hybrid color identities?
        let color = card.colors[k]

        // Skip any card colors that aren't a part of the deck's color
        // identity. This helps prevent hybrid cards accidentally bringing down
        // a given color's play rate.
        if (!decks[i].colors.includes(color)) {
          continue
        }
        tracker[color].cards += 1
        if (!cardsPerColorInDeck[color]) {
          cardsPerColorInDeck[color] = 0
        }
        cardsPerColorInDeck[color] += 1
      }
    }
    for (var color in cardsPerColorInDeck) {
      let num = cardsPerColorInDeck[color]
      tracker[color].deck_percentages.push(num / totalCardsInDeck)
    }
  }

  // Summarize tracker stats and calculate percentages.
  for (color in tracker) {
    // First, calculate the average color devotion of each deck based on card count.
    // This is a measure of, on average, how many cards of a given color appear in
    // decks with that color identity. A lower percentage means a splash, a higher percentage
    // means it is a primary staple.
    const density_sum = tracker[color].deck_percentages.reduce((sum, a) => sum + a, 0);
    const density_count = tracker[color].deck_percentages.length;
    tracker[color].average_deck_percentage = Math.round(100 * density_sum / density_count);

    // Calculate the percentage of all cards drafted that are this color.
    tracker[color].total_pick_percentage = Math.round(100 * tracker[color].cards / totalCards);
    tracker[color].build_percent = Math.round(tracker[color].num_decks / decks.length * 100)
    tracker[color].win_percent = Math.round(100 * tracker[color].wins / (tracker[color].wins + tracker[color].losses))
  }
  return tracker
}

function ColorRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let numBuckets = 8
  let buckets = DeckBuckets(input.decks, numBuckets)

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(bucket[0].name)
  }

  // Parse the buckets into color data.
  let monoColors = ["W", "U", "B", "R", "G"]
  let dualColors = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"]
  let allColors = [...monoColors, ...dualColors]
  let colorDatasets = new Map()
  for (let color of allColors) {
    colorDatasets.set(color, [])
  }
  for (let bucket of buckets) {
    // Aggregate all decks from within this bucket.
    let decks = new Array()
    for (let draft of bucket) {
      decks.push(...draft.decks)
    }

    // Parse the color stats of the decks.
    let stats = GetColorStats(decks)
    for (let color of allColors) {
      if (input.dataset === "wins") {
        colorDatasets.get(color).push(stats[color].win_percent)
      } else {
        colorDatasets.get(color).push(stats[color].build_percent)
      }
    }
  }

  let monoColorDatasets = [
      {
        label: 'White',
        data: colorDatasets.get("W"),
        borderColor: "#dce312",
        backgroundColor: "#dce312",
      },
      {
        label: 'Blue',
        data: colorDatasets.get("U"),
        borderColor: "#00F",
        backgroundColor: '#00F',
      },
      {
        label: 'Black',
        data: colorDatasets.get("B"),
        borderColor: "#888",
        backgroundColor: '#888',
      },
      {
        label: 'Red',
        data: colorDatasets.get("R"),
        borderColor: "#F00",
        backgroundColor: '#F00',
      },
      {
        label: 'Green',
        data: colorDatasets.get("G"),
        borderColor: "#0F0",
        backgroundColor: '#0F0',
      },
  ]

  // Generate a dual-color dataset as well.
  let dualColorDatasets = []
  for (let color of dualColors) {
    // A hacky way to get a deterministic color for each pair.
    // Might just be better to define a lookup table, but lazy.
    var n = (color.charCodeAt(0) + color.charCodeAt(1)) / 250
    var randomColor = Math.floor(n*16777215).toString(16);
    dualColorDatasets.push({
      label: color,
      data: colorDatasets.get(color),
      borderColor: "#" + randomColor,
      backgroundColor: "#" + randomColor,
    })
  }

  let dataset = monoColorDatasets
  switch (input.colorMode) {
    case "dual":
      dataset = dualColorDatasets
  }

  let title = `Build rate (buckets=${numBuckets})`
  switch (input.dataset) {
    case "wins":
      title = `Win rate (buckets=${numBuckets})`
  }

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
      <Line height={"300px"} width={"300px"} options={options} data={data} />;
    </div>
  );
}
