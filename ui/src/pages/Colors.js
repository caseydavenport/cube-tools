import React from 'react'
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { Colors, ColorImages, GetColorIdentity } from "../utils/Colors.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
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
    <table className="scroll-container-large">
      <tbody>
        <tr key="1">
          <td colSpan="2">
            <ColorStatsTable
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              ddOpts={input.ddOpts}
              colorTypeSelection={input.colorTypeSelection}
              decks={input.decks}
              onSelected={input.onSelected}
              onClick={input.onHeaderClick}
              sortBy={input.colorSortBy}
              strictColors={input.strictColors}
              selectedBucket={input.selectedBucket}
              onBucketSelected={input.onBucketSelected}
              onStrictCheckbox={input.onStrictCheckbox}
            />
          </td>
        </tr>

        <tr key="2">
          <td style={{"paddingTop": "50px", "width": "50%"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="builds"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
          <td style={{"paddingTop": "50px", "width": "50%"}}>
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
              dataset="vps_pct"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
          <td style={{"paddingTop": "50px"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset="vps"
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
        </tr>

        <tr key="5">
          <td colSpan="2">
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

// colorIsDisplayed returns true if the given color identity should be displayed - e.g.,
// if Dual is selected, mono and trio colors are filtered out.
function colorIsDisplayed(color, selection) {
  if (selection === "Dual" && color.length !== 2) {
    return false
  } else if (selection === "Mono" && color.length !== 1 ) {
    return false
  } else if (selection === "Trio" && color.length !== 3) {
    return false
  }
  return true
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
  if (input.parsed.deckBuckets.length > 0 && input.selectedBucket != "ALL") {
    for (let bucket of input.parsed.deckBuckets) {
      if (BucketName(bucket) === input.selectedBucket) {
        // UI has selected a particualr bucket to investigate, so pull the data from that bucket only.
        colorData = Array.from(bucket.colorData.values())
        break;
      }
    }
  }



  // We conditionally show / hide a few of the columns, because they are only
  // applicable when mono-color is displayed.
  let headerStyleFields = {}
  if (input.colorTypeSelection !== "Mono") {
    headerStyleFields.display = "none"
  }

  // Determine which rates to show, filtering out those which do not match the selected
  // color mode dropdown.
  let filtered = new Array();
  let totalVictoryPoints = 0;
  for (let d of colorData) {
    if (!colorIsDisplayed(d.color, input.colorTypeSelection)) {
      continue
    }

    // Inclue the color.
    filtered.push(d)

    // Track the total number of victory points within the selected colors, over the selected time frame.
    totalVictoryPoints += d.victory_points
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
      tip: "Percentage of all wins by decks that included this color.",
    },
    {
      id: "vps",
      text: "Victory point %",
      tip: "Weighted win contribution of this color, as a percentage of total wins across all decks.",
    },
    {
      id: "trophies",
      text: "Trophies",
      tip: "Number of 3-0 decks of this color.",
    },
    {
      id: "lastplace",
      text: "Last place",
      tip: "Number of 0-3 decks of this color.",
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
              } else if (input.sortBy === "vps") {
                sort = rates.victory_points
              } else if (input.sortBy === "trophies") {
                sort = rates.threeoh
              } else if (input.sortBy === "lastplace") {
                sort = rates.ohthree
              }

              let img = ColorImages(rates.color)
              let vpsPercentage = Math.round(100 * rates.victory_points / totalVictoryPoints)

              return (
                <tr key={idx} sort={sort} className="widget-table-row">
                  <td>{img}</td>
                  <td>{rates.win_percent}%</td>
                  <td>{rates.build_percent}%</td>
                  <td>{rates.percent_of_wins}%</td>
                  <td>{vpsPercentage}%</td>
                  <td>{rates.threeoh}</td>
                  <td>{rates.ohthree}</td>
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
  // Build selected bucket dropdown.
  let bucketNames = new Array();
  bucketNames.push({label: "ALL", value: "ALL"});
  for (let bucket of input.parsed.deckBuckets) {
    bucketNames.push(
      {
        label: BucketName(bucket),
        value: BucketName(bucket),
      },
    );
  }

  return (
    <div className="full-options-header">
      <DropdownHeader
        label="Select color type"
        className="dropdown"
        options={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={input.onSelected}
      />

      <DropdownHeader
        label="Select a bucket"
        className="dropdown"
        options={bucketNames}
        value={input.selectedBucket}
        onChange={input.onBucketSelected}
      />

      <Checkbox
        text="Strict"
        className="dropdown"
        checked={input.strictColors}
        onChange={input.onStrictCheckbox}
      />
    </div>
  )
}

// GetColorStats collects statistics aggregated by color and color pair based on the given decks.
export function GetColorStats(decks, strictColors) {
  console.time("GetColorStats")
  let tracker = new Map()

  // Count of all cards ever drafted. This will be used to calculate pick percentages per-color.
  let totalCards = 0

  // Function for initializing an empty color.
  let newColor = function(color) {
    return {
      color: color,

      // Number of game wins, losses.
      wins: 0,
      losses: 0,

      // Number of cards of this color.
      cards: 0,

      // Track the number of 3-0 and 0-3 decks.
      threeoh: 0,
      ohthree: 0,

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

      // Fractional number of wins attributed to this color based on deck composition across
      // all decks in the timeframe.
      victory_points: 0,

      // Number of victory points that this color could have achieved, if it had won every game.
      available_victory_points: 0,

      // Each entry represents the contribution of a particular deck.
      victory_points_per_deck: [],

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
      tracker.get(color).threeoh += Trophies(decks[i])
      tracker.get(color).ohthree += LastPlaceFinishes(decks[i])
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
      // Get the number of cards that match this color within the deck.
      let num = cardsPerColorInDeck[color]

      // Track the percentage of cards in the deck that belong to this color.
      let deckFrac = num / totalCardsInDeck
      tracker.get(color).deck_percentages.push(deckFrac)

      // Calculate "victory points" - the number of wins attributed to this color by weighting
      // the deck's total number of wins by the percentage of cards that belong to this color.
      let winFrac = deckFrac * Wins(decks[i])
      tracker.get(color).victory_points_per_deck.push(winFrac)

      // Calculate the total number of victory points that could have been achieved - i.e., if
      // all losses were instead wins.
      let lossFrac = deckFrac * Losses(decks[i])
      if (winFrac + lossFrac > 0) {
        tracker.get(color).available_victory_points += (winFrac + lossFrac)
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
    color.victory_points = Math.round(100 * color.victory_points_per_deck.reduce((sum, a) => sum + a, 0)) / 100;

    // Calculate the percentage of all cards drafted that are this color.
    color.total_pick_percentage = Math.round(100 * color.cards / totalCards);
    color.build_percent = Math.round(color.num_decks / decks.length * 100)
    color.win_percent = Math.round(100 * color.wins / (color.wins + color.losses))
    color.percent_of_wins = Math.round(100 * color.wins / totalWins)
  }

  console.timeEnd("GetColorStats")
  return tracker
}

function ColorRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.parsed.deckBuckets;

  // Mapping of colors to human-readable names.
  let colorNames = new Map();
  colorNames.set("WU", "Azorius")
  colorNames.set("WB", "Orzhov")
  colorNames.set("WR", "Boros")
  colorNames.set("WG", "Selesnya")
  colorNames.set("UB", "Dimir")
  colorNames.set("UR", "Izzet")
  colorNames.set("BR", "Rakdos")
  colorNames.set("BG", "Golgari")
  colorNames.set("RG", "Gruul")
  colorNames.set("UG", "Simic")

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

    // Calcualte total victory points for this bucket, used below to calculate percentage
    // of available victory points for each color.
    let totalVictoryPoints = 0;
    for (let color of allColors) {
      if (!colorIsDisplayed(color, input.colorMode)) {
        continue
      }
      if (stats.has(color)) {
        totalVictoryPoints += stats.get(color).victory_points
      }
    }

    for (let color of allColors) {
      if (!stats.has(color)) {
        colorDatasets.get(color).push(0)
        continue
      }

      if (input.dataset === "wins") {
        colorDatasets.get(color).push(stats.get(color).win_percent)
      } else if (input.dataset === "vps") {
        colorDatasets.get(color).push(stats.get(color).victory_points)
      } else if (input.dataset === "possible_vps") {
        colorDatasets.get(color).push(stats.get(color).available_victory_points)
      } else if (input.dataset === "vps_pct") {
        colorDatasets.get(color).push(100 * stats.get(color).victory_points / totalVictoryPoints)
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

  // Configuration for datasets.
  let hoverBorderWidth = 4;
  let hoverBorderColor = "red"

  let monoColorDatasets = [
      {
        label: 'White',
        data: colorDatasets.get("W"),
        borderColor: Colors.get("W"),
        backgroundColor: Colors.get("W"),
        hoverBorderColor: hoverBorderColor,
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Blue',
        data: colorDatasets.get("U"),
        borderColor: Colors.get("U"),
        backgroundColor: Colors.get("U"),
        hoverBorderColor: hoverBorderColor,
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Black',
        data: colorDatasets.get("B"),
        borderColor: Colors.get("B"),
        backgroundColor: Colors.get("B"),
        hoverBorderColor: hoverBorderColor,
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Red',
        data: colorDatasets.get("R"),
        borderColor: Colors.get("R"),
        backgroundColor: Colors.get("R"),
        hoverBorderColor: hoverBorderColor,
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Green',
        data: colorDatasets.get("G"),
        borderColor: Colors.get("G"),
        backgroundColor: Colors.get("G"),
        hoverBorderColor: hoverBorderColor,
        hoverBorderWidth: hoverBorderWidth,
      },
  ]

  // Generate a dual-color dataset as well.
  let dualColorDatasets = []
  for (let color of dualColors) {
    dualColorDatasets.push({
      label: colorNames.get(color) ?? color,
      data: colorDatasets.get(color),
      borderColor: StringToColor(color),
      backgroundColor: StringToColor(color),
      hoverBorderColor: hoverBorderColor,
      hoverBorderWidth: hoverBorderWidth,
    })
  }

  let triColorDatasets = []
  for (let color of triColors) {
    triColorDatasets.push({
      label: colorNames.get(color) ?? color,
      data: colorDatasets.get(color),
      borderColor: StringToColor(color),
      backgroundColor: StringToColor(color),
      hoverBorderColor: hoverBorderColor,
      hoverBorderWidth: hoverBorderWidth,
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
      break;
    case "vps":
      title = `Victory points (bucket size = ${input.bucketSize} drafts)`
      break;
    case "possible_vps":
      title = `Possible victory points (bucket size = ${input.bucketSize} drafts)`
      break;
    case "vps_pct":
      title = `Percentage of victory points (bucket size = ${input.bucketSize} drafts)`
      break;
    case "pick_percentage":
      title = `Percentage of mainboard picks (bucket size = ${input.bucketSize} drafts)`
      break;
    case "splash":
      title = `Avg. percentage of decks (bucket size = ${input.bucketSize} drafts)`
      break;
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
  max = Math.ceil(max / 10) * 10
  min = Math.floor(min / 20) * 20
  if (max >= 90) {
    max = 100
  }
  if (min <= 10) {
    min = 0
  }

  const options = {
    responsive: true,
    borderWidth: 3,
    maintainAspectRatio: false,
    scales: {y: {min: min, max: max}},
    hover: {
      mode: 'dataset'
    },
    elements: {
      point: {
        hitRadius: 10
      }
    },
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
    <div style={{"height":"500px"}}>
      <Line height={"300px"} options={options} data={data} />
    </div>
  );
}
