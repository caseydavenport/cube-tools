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

  let colorData = GetColorStats(input.decks)

  return (
    <table style={{"width": "100%"}}>
      <tbody>
        <tr>
          <td style={{"width": "50%"}}>
            <ColorStatsTable
              colorData={colorData}
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
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              colorData={colorData}
              decks={input.decks}
              dataset="builds"
              colorMode={input.colorTypeSelection}
              numBuckets={input.numBuckets}
            />
          </td>
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              decks={input.decks}
              dataset="wins"
              colorMode={input.colorTypeSelection}
              numBuckets={input.numBuckets}
            />
          </td>
        </tr>
        <tr>
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              colorData={colorData}
              decks={input.decks}
              dataset="shares"
              colorMode={input.colorTypeSelection}
              numBuckets={input.numBuckets}
            />
          </td>
        </tr>
      </tbody>
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
  let colorData = Array.from(input.colorData.values())

  // We conditionally show / hide a few of the columns, because they are only
  // applicable when mono-color is displayed.
  let headerStyleFields = {}
  if (input.dropdownSelection !== "Mono") {
    headerStyleFields.display = "none"
  }

  // Determine which rates to show.
  let filtered = new Array()
  for (let d of colorData) {
    // If dual is set, only show dual colors.
    // Otherwise, only show single colors.
    // `color` here is a string made of one or more characters - e.g., W or UB.
    if (input.dropdownSelection === "Dual" && d.color.length !== 2) {
      continue
    } else if (input.dropdownSelection === "Mono" && d.color.length !== 1 ) {
      continue
    } else if (input.dropdownSelection === "Trio" && d.color.length !== 3) {
      continue
    }
    filtered.push(d)
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
            <td onClick={input.onClick} id="win" className="header-cell">Win %</td>
            <td onClick={input.onClick} id="build" className="header-cell">Build %</td>
            <td onClick={input.onClick} id="pwin" className="header-cell">% of wins</td>
            <td onClick={input.onClick} id="shares" className="header-cell">Shares</td>
            <td onClick={input.onClick} id="record" className="header-cell">Record</td>
            <td onClick={input.onClick} id="decks" className="header-cell"># Decks</td>
            <td onClick={input.onClick} id="picks" className="header-cell" style={headerStyleFields}>% picks</td>
            <td onClick={input.onClick} id="splash" className="header-cell">Avg % of deck</td>
          </tr>
        </thead>
        <tbody>
          {
            filtered.map(function(rates) {
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
              } else if (input.sortBy === "pwin") {
                sort = rates.percent_of_wins
              } else if (input.sortBy === "shares") {
                sort = rates.win_shares
              }

              return (
                <tr key={rates.color} sort={sort} className="winrate-row">
                  <td>{rates.color}</td>
                  <td>{rates.win_percent}%</td>
                  <td>{rates.build_percent}%</td>
                  <td>{rates.percent_of_wins}%</td>
                  <td>{rates.win_shares}</td>
                  <td>{record}</td>
                  <td>{rates.num_decks}</td>
                  <td style={headerStyleFields}>{rates.total_pick_percentage}%</td>
                  <td>{rates.average_deck_percentage}%</td>
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
  let tracker = new Map()

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

      // Win shares is the percentage of the deck that is this color
      // combined with the win percentage of the deck, to approximate the impact this color
      // had on winning.
      deck_win_shares: [],
      win_shares: 0,
    }
  }

  let totalWins = 0
  for (var i in decks) {
    // Add this deck's wins to the total count of games.
    totalWins += Wins(decks[i])

    // Start by adding metrics at the deck scope for color identity.
    // Add wins and losses contributed for each color / color combination within this deck.
    let colors = GetColorIdentity(decks[i])
    for (var j in colors) {
      let color = colors[j]
      if (!tracker.has(color)) {
        tracker.set(color, newColor(color))
      }
      tracker.get(color).wins += Wins(decks[i])
      tracker.get(color).losses += Losses(decks[i])
      tracker.get(color).num_decks += 1
    }

    // Add metrics to the color based on card scope statistics.
    // Calculate the total number of cards drafted of the color across
    // all drafts, as well as the percentage of that color within the deck, which we'll
    // use to calculate an indicator of which colors are primary and whicn are splashed.
    let totalCardsInDeck = 0
    for (let card of decks[i].mainboard) {
      // Skip basic lands, since they just dilute the percentages.
      if (IsBasicLand(card)) {
        continue
      }
      totalCards += 1
      totalCardsInDeck += 1
    }
    let cardsPerColorInDeck = {}

    // Go through each color in the deck's color identity, and increment
    // the count of cards within the deck that match that color identity.
    // TODO: This calculation excludes colorless cards, meaning percentages for colors
    // will not add up to 100%.
    for (let deckColor of colors) {
      for (let card of decks[i].mainboard) {
        // Skip basic lands, since they just dilute the percentages.
        if (IsBasicLand(card)) {
          continue
        }
        for (var k in card.colors) {
          let cardColor = card.colors[k]
          if (!deckColor.includes(cardColor)) {
            continue
          }
          if (!cardsPerColorInDeck[deckColor]) {
            cardsPerColorInDeck[deckColor] = 0
          }
          cardsPerColorInDeck[deckColor] += 1
        }
      }
    }

    for (var color in cardsPerColorInDeck) {
      let num = cardsPerColorInDeck[color]
      tracker.get(color).deck_percentages.push(num / totalCardsInDeck)
      tracker.get(color).deck_win_shares.push(num / totalCardsInDeck * Wins(decks[i]))
      tracker.get(color).cards += num
    }
  }

  // Summarize tracker stats and calculate percentages.
  for (let color of tracker.values()) {
    // First, calculate the average color devotion of each deck based on card count.
    // This is a measure of, on average, how many cards of a given color appear in
    // decks with that color identity. A lower percentage means a splash, a higher percentage
    // means it is a primary staple.
    const density_sum = color.deck_percentages.reduce((sum, a) => sum + a, 0);
    const density_count = color.deck_percentages.length;
    color.average_deck_percentage = Math.round(100 * density_sum / density_count);
    color.win_shares = Math.round(10 * color.deck_win_shares.reduce((sum, a) => sum + a, 0)) / 10;

    // Calculate the percentage of all cards drafted that are this color.
    color.total_pick_percentage = Math.round(100 * color.cards / totalCards);
    color.build_percent = Math.round(color.num_decks / decks.length * 100)
    color.win_percent = Math.round(100 * color.wins / (color.wins + color.losses))
    color.percent_of_wins = Math.round(100 * color.wins / totalWins)
  }
  return tracker
}

function ColorRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = DeckBuckets(input.decks, input.numBuckets)

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
  let triColors = ["WUG", "WUB", "UBR", "BRG", "WRG", "WBG", "WUR", "UBG", "WBR", "URG"]
  let allColors = [...monoColors, ...dualColors, ...triColors]
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
      if (!stats.has(color)) {
        continue
      }
      if (input.dataset === "wins") {
        colorDatasets.get(color).push(stats.get(color).win_percent)
      } else if (input.dataset === "shares") {
        colorDatasets.get(color).push(stats.get(color).win_shares)
      } else {
        colorDatasets.get(color).push(stats.get(color).build_percent)
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

  let triColorDatasets = []
  for (let color of triColors) {
    // A hacky way to get a deterministic color for each pair.
    // Might just be better to define a lookup table, but lazy.
    var n = (color.charCodeAt(0) + color.charCodeAt(1) + color.charCodeAt(2)) / 250
    var randomColor = Math.floor(n*16777215).toString(16);
    triColorDatasets.push({
      label: color,
      data: colorDatasets.get(color),
      borderColor: "#" + randomColor,
      backgroundColor: "#" + randomColor,
    })
  }

  let dataset = monoColorDatasets
  switch (input.colorMode) {
    case "Dual":
      dataset = dualColorDatasets
      break;
    case "Trio":
      dataset = triColorDatasets
  }

  let title = `Build % (buckets=${input.numBuckets})`
  switch (input.dataset) {
    case "wins":
      title = `Win % (buckets=${input.numBuckets})`
      break
    case "shares":
      title = `Win shares (buckets=${input.numBuckets})`
      break
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    // scales: {y: {min: 0}},
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
