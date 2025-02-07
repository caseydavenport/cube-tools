import React from 'react'
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { Colors, ColorImages, GetColorIdentity } from "../utils/Colors.js"
import { Wins, Losses } from "../utils/Deck.js"
import { IsBasicLand, SortFunc, StringToColor } from "../utils/Utils.js"
import { BucketName } from "../utils/Buckets.js"

import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';
import {
  Tooltip as TooltipJS,
} from 'react-bootstrap';

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
    return
  }

  return (
    <table style={{"width": "100%"}}>
      <tbody>
        <tr key="1">
          <td style={{"width": "50%"}}>
            <ColorStatsTable
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              ddOpts={input.ddOpts}
              dropdownSelection={input.colorTypeSelection}
              decks={input.decks}
              onSelected={input.onSelected}
              onClick={input.onHeaderClick}
              sortBy={input.colorSortBy}
              strictColors={input.strictColors}
              onStrictCheckbox={input.onStrictCheckbox}
            />
          </td>
          <td style={{"width": "50%"}}> </td>
        </tr>

        <tr key="2">
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="builds"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              decks={input.decks}
              dataset="wins"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
        </tr>

        <tr key="3">
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="pick_percentage"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="splash"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
        </tr>

        <tr key="4">
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="possible_shares"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="shares"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
        </tr>

        <tr key="5">
          <td colSpan="3">
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="percent_of_wins"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
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

  let headers = [
    {
      id: "color",
      text: "Color",
      tip: "The color or colors of the deck. If 'strict' is checked, the row includes data only from decks that are exactly this color. Otherwise, the row includes data from any decks that include this color/colors."
    },
    {
      id: "win",
      text: "Win %",
      tip: "Percentages of games played by this color/colors that were wins.",
    },
    {
      id: "build",
      text: "Build %",
      tip: "Percentages of all built decks that include this color/colors.",
    },
    {
      id: "pwin",
      text: "% of wins",
      tip: "Percentage of all wins across all decks that included this color.",
    },
    {
      id: "shares",
      text: "Shares",
      tip: "Wins, weighted by the number of cards of this color that were in the deck.",
    },
    {
      id: "record",
      text: "Record",
      tip: "Wins, losses, and draws.",
    },
    {
      id: "decks",
      text: "# Decks",
      tip: "Number of decks in this row.",
    },
    {
      id: "picks",
      text: "% picks",
      tip: "Percentage of mainboarded cards that are this color (or one of these colors).",
    },
    {
      id: "splash",
      text: "Avg % of deck",
      tip: "Percentage of non-land cards in the deck that match this color identity.",
    },
  ]

  return (
    <div>
      <TableHeader {...input} />

      <table className="widget-table">
        <thead className="table-header">
          <tr key="header">
            {
              headers.map(function(hdr, i) {
                return (
                  <OverlayTrigger
                    placement="top"
                    delay={{ show: 100, hide: 100 }}
                    overlay={
                      <Popover id="popover-basic">
                        <Popover.Header as="h3">{hdr.text}</Popover.Header>
                        <Popover.Body>
                          {hdr.tip}
                        </Popover.Body>
                      </Popover>
                    }
                  >
                    <td onClick={input.onClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                  </OverlayTrigger>
                );
              })
            }
          </tr>
        </thead>
        <tbody>
          {
            filtered.map(function(rates, idx) {
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

              let img = ColorImages(rates.color)

              return (
                <tr key={idx} sort={sort} className="widget-table-row">
                  <td>{img}</td>
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

function TableHeader(input) {
  return (
    <div className="full-options-header">
      <DropdownHeader
        label="Select color type"
        className="dropdown-header-side-by-side"
        options={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={input.onSelected}
      />

      <Checkbox
        text="Strict"
        className="dropdown-header-side-by-side"
        checked={input.strictColors}
        onChange={input.onStrictCheckbox}
      />
    </div>
  )
}

// GetColorStats collects statistics aggregated by color and color pair based on the given decks.
export function GetColorStats(decks, strictColors) {
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
      possible_win_shares: 0,
      win_shares: 0,
      win_shares_converterd: 0,
    }
  }

  let totalWins = 0
  for (var i in decks) {
    // Add this deck's wins to the total count of games.
    totalWins += Wins(decks[i])

    // Start by adding metrics at the deck scope for color identity.
    // Add wins and losses contributed for each color / color combination within this deck.
    let colorIdentity = GetColorIdentity(decks[i])

    // If we're in strict mode, ignore any color that isn't strictly the color ideneity of
    // the deck. For example, a WG deck will only count as WG in strict mode, where as it would
    // count as W, G, and WG norally.
    let colors = new Array()
    for (let color of colorIdentity) {
      if (strictColors) {
        if (decks[i].colors.length != color.length) {
          continue
        }
      }
      colors.push(color)
    }

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
    // use to calculate an indicator of which colors are primary and which are splashed.
    let totalCardsInDeck = 0
    for (let card of decks[i].mainboard) {
      // Skip basic lands, since they just dilute the percentages.
      if (IsBasicLand(card)) {
        continue
      }
      totalCards += 1
      totalCardsInDeck += 1
    }

    // Go through each color in the deck's color identity, and increment
    // the count of cards within the deck that match that color identity.
    // TODO: This calculation excludes colorless cards, meaning percentages for colors
    // will not add up to 100%.
    let cardsPerColorInDeck = {}
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

          // Once we count a card as counting towards this part of the deck's identity,
          // we don't need to count the same card twice (e.g., if it is multi-color and matches
          // the deck twice).
          break
        }
      }
    }

    for (var color in cardsPerColorInDeck) {
      let num = cardsPerColorInDeck[color]
      tracker.get(color).deck_percentages.push(num / totalCardsInDeck)
      let winFrac = num / totalCardsInDeck * Wins(decks[i])
      let lossFrac = num / totalCardsInDeck * Losses(decks[i])
      tracker.get(color).deck_win_shares.push(winFrac)
      if (winFrac + lossFrac > 0) {
        tracker.get(color).possible_win_shares += (winFrac + lossFrac)
      }
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
    color.win_shares = Math.round(100 * color.deck_win_shares.reduce((sum, a) => sum + a, 0)) / 100;
    color.win_shares_converterd = Math.round(100 * color.win_shares / color.possible_win_shares) / 100;

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
  let buckets = input.parsed.deckBuckets

  // Use the starting date of the bucket as the label. This is just an approximation,
  // as the bucket really includes a variable set of dates, but it allows the viewer to
  // at least place some sense of time to the chart.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
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
    let stats = bucket.colorData
    for (let color of allColors) {
      if (!stats.has(color)) {
        colorDatasets.get(color).push(0)
        continue
      }
      if (input.dataset === "wins") {
        colorDatasets.get(color).push(stats.get(color).win_percent)
      } else if (input.dataset === "shares") {
        colorDatasets.get(color).push(stats.get(color).win_shares)
      } else if (input.dataset === "possible_shares") {
        colorDatasets.get(color).push(stats.get(color).possible_win_shares)
      } else if (input.dataset === "shares_converted") {
        colorDatasets.get(color).push(stats.get(color).win_shares_converterd)
      } else if (input.dataset === "pick_percentage") {
        colorDatasets.get(color).push(stats.get(color).total_pick_percentage)
      } else if (input.dataset === "splash") {
        colorDatasets.get(color).push(stats.get(color).average_deck_percentage)
      } else if (input.dataset === "percent_of_wins") {
        colorDatasets.get(color).push(stats.get(color).percent_of_wins)
      } else {
        colorDatasets.get(color).push(stats.get(color).build_percent)
      }
    }
  }

  let monoColorDatasets = [
      {
        label: 'White',
        data: colorDatasets.get("W"),
        borderColor: Colors.get("W"),
        backgroundColor: Colors.get("W"),
      },
      {
        label: 'Blue',
        data: colorDatasets.get("U"),
        borderColor: Colors.get("U"),
        backgroundColor: Colors.get("U"),
      },
      {
        label: 'Black',
        data: colorDatasets.get("B"),
        borderColor: Colors.get("B"),
        backgroundColor: Colors.get("B"),
      },
      {
        label: 'Red',
        data: colorDatasets.get("R"),
        borderColor: Colors.get("R"),
        backgroundColor: Colors.get("R"),
      },
      {
        label: 'Green',
        data: colorDatasets.get("G"),
        borderColor: Colors.get("G"),
        backgroundColor: Colors.get("G"),
      },
  ]

  // Generate a dual-color dataset as well.
  let dualColorDatasets = []
  for (let color of dualColors) {
    dualColorDatasets.push({
      label: color,
      data: colorDatasets.get(color),
      borderColor: StringToColor(color),
      backgroundColor: StringToColor(color),
    })
  }

  let triColorDatasets = []
  for (let color of triColors) {
    triColorDatasets.push({
      label: color,
      data: colorDatasets.get(color),
      borderColor: StringToColor(color),
      backgroundColor: StringToColor(color),
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

  let title = `Build % (bucket size = ${input.bucketSize} drafts)`
  switch (input.dataset) {
    case "wins":
      title = `Win % (buckets size = ${input.bucketSize} drafts)`
      break
    case "shares":
      title = `Win shares (bucket size = ${input.bucketSize} drafts)`
      break
    case "possible_shares":
      title = `Possible win shares (bucket size = ${input.bucketSize} drafts)`
      break
    case "shares_converted":
      title = `Win shares converted (bucket size = ${input.bucketSize} drafts)`
      break
    case "pick_percentage":
      title = `Percentage of mainboard picks (bucket size = ${input.bucketSize} drafts)`
      break
    case "splash":
      title = `Avg. percentage of decks (bucket size = ${input.bucketSize} drafts)`
      break
    case "percent_of_wins":
      title = `Percent of wins (bucket size = ${input.bucketSize} drafts)`
      break;
  }

  // Calculate the max based on our data set, which structured as an array of dictionary objects
  // each with a data field that is itself an array of values.
  let max = 0
  let min = 100
  for (let set of dataset) {
    let values = set.data
    let colorMax = Math.max(...values)
    let colorMin = Math.min(...values)
    if (colorMax > max) {
      max = colorMax
    }
    if (colorMin < min) {
      min = colorMin
    }
  }
  // Round things.
  max = Math.ceil(max / 20) * 20
  min = Math.floor(min / 20) * 20

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: min, max: max}},
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
