import React from 'react'
import { DropdownHeader, NumericInput, DateSelector } from "../components/Dropdown.js"
import { Colors, ColorImages, GetColorIdentity, primaryColorPair, CUBE_AVG_WIN_PERCENT, deltaPositiveFill, deltaNegativeFill } from "../utils/Colors.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
import { bucketXScale } from "../utils/Buckets.js"
import { AverageWordCount, IsBasicLand, MinWinningPctDecks, Pct, SortFunc, StringToColor } from "../utils/Utils.js"

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
  BarElement,
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
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Human-readable names for color identities, used to label delta bars.
const colorIdentityNames = new Map([
  ["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"],
  ["WU", "Azorius"], ["WB", "Orzhov"], ["WR", "Boros"], ["WG", "Selesnya"],
  ["UB", "Dimir"], ["UR", "Izzet"], ["UG", "Simic"], ["BR", "Rakdos"], ["BG", "Golgari"], ["RG", "Gruul"],
  ["WUB", "Esper"], ["WUR", "Jeskai"], ["WUG", "Bant"], ["WBR", "Mardu"], ["WBG", "Abzan"],
  ["WRG", "Naya"], ["UBR", "Grixis"], ["UBG", "Sultai"], ["URG", "Temur"], ["BRG", "Jund"],
])

export function ColorWidget(input) {
  const [leftChart, setLeftChart] = React.useState("builds")
  const [rightChart, setRightChart] = React.useState("wins")

  if (!input.show) {
    return
  }

  const chartOptions = [
    { label: "Build %", value: "builds" },
    { label: "Win %", value: "wins" },
    { label: "Pick %", value: "pick_percentage" },
    { label: "Avg Deck Devotion", value: "splash" },
    { label: "VP %", value: "vps_pct" },
    { label: "Victory Points", value: "vps" },
    { label: "% of wins", value: "percent_of_wins" },
    { label: "Winning %", value: "winning_pct" },
    { label: "Trophy %", value: "trophy_pct" },
    { label: "Last Place %", value: "lastplace_pct" },
  ]

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
              colorMode={input.colorMode}
              onColorModeChanged={input.onColorModeChanged}
              selectedBucket={input.selectedBucket}
              onBucketSelected={input.onBucketSelected}
            />
          </td>
        </tr>

        <tr key="charts-header">
          <td style={{"paddingTop": "50px", "width": "50%"}}>
            <div className="selector-group" style={{"justifyContent": "center"}}>
              <DropdownHeader
                label="Left Chart"
                options={chartOptions}
                value={leftChart}
                onChange={(e) => setLeftChart(e.target.value)}
              />
            </div>
          </td>
          <td style={{"paddingTop": "50px", "width": "50%"}}>
            <div className="selector-group" style={{"justifyContent": "center"}}>
              <DropdownHeader
                label="Right Chart"
                options={chartOptions}
                value={rightChart}
                onChange={(e) => setRightChart(e.target.value)}
              />
            </div>
          </td>
        </tr>

        <tr key="charts-body">
          <td style={{"width": "50%"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset={leftChart}
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
          <td style={{"width": "50%"}}>
            <ColorRateChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              decks={input.decks}
              dataset={rightChart}
              colorMode={input.colorTypeSelection}
              bucketSize={input.bucketSize}
            />
          </td>
        </tr>

        <tr key="delta-chart">
          <td colSpan="2" style={{"paddingTop": "50px"}}>
            <ColorPerformanceDeltaChart
              parsed={input.parsed}
              colorData={input.parsed.colorData}
              colorTypeSelection={input.colorTypeSelection}
              selectedBucket={input.selectedBucket}
            />
          </td>
        </tr>

        <tr key="matchup-heatmap">
          <td colSpan="2" style={{"paddingTop": "50px"}}>
            <ColorMatchupHeatmap matchupData={input.colorMatchupData} colorType={input.colorTypeSelection} />
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
  let buckets = input.parsed.colorDataBucketed
  if (input.parsed.colorDataBucketed.length > 0 && input.selectedBucket != "ALL") {
    for (let bucket of buckets) {
      if (bucket.name === input.selectedBucket) {
        // UI has selected a particualr bucket to investigate, so pull the data from that bucket only.
        let data = new Map(Object.entries(bucket.data))
        colorData = Array.from(data.values())
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
      id: "delta",
      text: "Δ vs avg",
      tip: "Win rate relative to the cube-wide average (50%). Positive (green) means this color wins more than its share of games; negative (red) means it loses more.",
    },
    {
      id: "build",
      text: "Build %",
      tip: "Percentages of all built decks that include this color/colors.",
    },
    {
      id: "pwin",
      text: "% of wins",
      tip: "Share of wins among rows of this same identity length (mono, dual, tri). Sums to ~100% within each view.",
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
      id: "winning",
      text: "Winning",
      tip: "Number of 2-1 or better.",
    },
    {
      id: "losing",
      text: "Losing",
      tip: "Number of 1-2 or worse.",
    },
    {
      id: "winning_pct",
      text: "Winning %",
      tip: "Percentage of decks with a 2-1 or better match record.",
    },
    {
      id: "decks",
      text: "# Decks",
      tip: "Number of decks in this row.",
    },
    {
      id: "picks",
      text: "Pick %",
      tip: "This color's share of all mainboarded cards across every deck. Sums to ~100% across rows.",
    },
    {
      id: "splash",
      text: "Avg Deck Devotion",
      tip: "For each deck, the fraction of non-land cards matching this color identity, then averaged across decks. Each deck contributes equally regardless of size.",
    },
    {
      id: "avg_word_count",
      text: "Avg Words",
      tip: "Average word count per non-land card in decks with this color, excluding reminder text.",
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
                    key={i}
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
            filtered.map(function(color, idx) {

              // Determine what we're sorting by. Default to sorting by win percentage.
              let sort = color.win_percent
              if (input.sortBy === "delta") {
                sort = color.win_percent - CUBE_AVG_WIN_PERCENT
              } else if (input.sortBy === "build") {
                sort = color.build_percent
              } else if (input.sortBy === "decks") {
                sort = color.num_decks
              } else if (input.sortBy === "color") {
                sort = color.color
              } else if (input.sortBy === "picks") {
                sort = color.total_pick_percentage
              } else if (input.sortBy === "splash") {
                sort = color.average_deck_percentage
              } else if (input.sortBy === "pwin") {
                sort = color.percent_of_wins
              } else if (input.sortBy === "vps") {
                sort = color.victory_points
              } else if (input.sortBy === "trophies") {
                sort = color.trophies
              } else if (input.sortBy === "lastplace") {
                sort = color.last_place
              } else if (input.sortBy === "winning") {
                sort = color.top_half
              } else if (input.sortBy === "losing") {
                sort = color.bottom_half
              } else if (input.sortBy === "winning_pct") {
                sort = color.num_decks >= MinWinningPctDecks ? color.top_half / color.num_decks : -1
              } else if (input.sortBy === "avg_word_count") {
                sort = color.avg_word_count || 0
              }

              let img = ColorImages(color.color)
              let vpsPercentage = Pct(color.victory_points, totalVictoryPoints)

              return (
                <tr key={idx} sort={sort} className="widget-table-row">
                  <td>{img}</td>
                  <td>{color.win_percent.toFixed(0)}%</td>
                  <td className={color.win_percent - CUBE_AVG_WIN_PERCENT >= 0 ? "positive" : "negative"}>
                    {(color.win_percent - CUBE_AVG_WIN_PERCENT >= 0 ? "+" : "") + (color.win_percent - CUBE_AVG_WIN_PERCENT).toFixed(0) + "%"}
                  </td>
                  <td>{color.build_percent.toFixed(0)}%</td>
                  <td>{color.percent_of_wins.toFixed(0)}%</td>
                  <td>{vpsPercentage}%</td>
                  <td>{color.trophies}</td>
                  <td>{color.last_place}</td>
                  <td>{color.top_half}</td>
                  <td>{color.bottom_half}</td>
                  <td>{color.num_decks >= MinWinningPctDecks ? Pct(color.top_half, color.num_decks) + "%" : "—"}</td>
                  <td>{color.num_decks}</td>
                  <td style={headerStyleFields}>{color.total_pick_percentage}%</td>
                  <td>{color.average_deck_percentage}%</td>
                  <td>{color.avg_word_count || 0}</td>
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
  for (let bucket of input.parsed.colorDataBucketed) {
    bucketNames.push(
      {
        label: bucket.name,
        value: bucket.name,
      },
    );
  }

  return (
    <div className="selector-group" style={{"justifyContent": "center", "marginBottom": "1rem"}}>
      <DropdownHeader
        label="Color type"
        className="dropdown"
        options={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={input.onSelected}
      />

      <DropdownHeader
        label="Bucket"
        className="dropdown"
        options={bucketNames}
        value={input.selectedBucket}
        onChange={input.onBucketSelected}
      />

      <DropdownHeader
        label="Color mode"
        className="dropdown"
        options={[
          { label: "Inclusive", value: "inclusive" },
          { label: "Exact", value: "exact" },
          { label: "Primary pair", value: "primary" },
        ]}
        value={input.colorMode}
        onChange={input.onColorModeChanged}
      />
    </div>
  )
}

// GetColorStats collects statistics aggregated by color and color pair based on the given decks.
//
// Duplicates the server-side logic in pkg/server/stats/colors.go. We need
// the client-side copy because per-player color breakdowns (Players.js) and
// live re-filtering by color checkboxes / match string (StatsHooks.js)
// recompute without a server round-trip. Keep the two in sync.
//
// TODO: add a server endpoint that takes those extra filter axes and delete
// this function.
export function GetColorStats(decks, colorMode) {
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
      trophies: 0,
      last_place: 0,

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

      // Average word count per non-land card.
      avg_word_count: 0,
      word_count_sum: 0,
      word_count_count: 0,
    }
  }

  for (var i in decks) {
    // Start by adding metrics at the deck scope for color identity.
    // Add wins and losses contributed for each color / color combination within this deck.
    let colorIdentity = GetColorIdentity(decks[i])

    // In "inclusive" mode, a deck contributes to all sub-identities (W, U, WU for a WU deck).
    // In "exact" mode, only the exact color identity matches (WU only).
    // In "primary" mode, same as exact but 3+ color decks with a clear primary pair
    // (splash colors) are treated as their primary pair.
    let strict = colorMode === "exact" || colorMode === "primary"
    let primaryPair = null
    if (colorMode === "primary" && decks[i].colors.length >= 3) {
      let pair = primaryColorPair(decks[i])
      if (pair != null) {
        primaryPair = pair[0] + pair[1]
      }
    }
    let colors = new Array()
    if (primaryPair != null) {
      // 3+ color deck with a clear primary pair: contribute only to that
      // pair, not to every 2-char sub-identity (which would triple-count a
      // WUG-with-WU-primary deck into WU, WG, and UG).
      colors.push(primaryPair)
    } else {
      let effectiveColorCount = decks[i].colors.length
      for (let color of colorIdentity) {
        if (strict && effectiveColorCount != color.length) {
          continue
        }
        colors.push(color)
      }
    }

    for (var j in colors) {
      let color = colors[j]

      if (!tracker.has(color)) {
        tracker.set(color, newColor(color))
      }
      tracker.get(color).wins += Wins(decks[i])
      tracker.get(color).losses += Losses(decks[i])
      tracker.get(color).trophies += Trophies(decks[i])
      tracker.get(color).last_place += LastPlaceFinishes(decks[i])
      tracker.get(color).num_decks += 1

      let avgWC = AverageWordCount({deck: decks[i]})
      if (avgWC !== null) {
        tracker.get(color).word_count_sum += avgWC
        tracker.get(color).word_count_count += 1
      }
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

  // Normalize percent_of_wins within each identity length so the column sums
  // to 100% in mono, dual, and tri views independently.
  let winsByLen = {}
  for (let color of tracker.values()) {
    winsByLen[color.color.length] = (winsByLen[color.color.length] || 0) + color.wins
  }

  // Summarize tracker stats and calculate percentages.
  for (let color of tracker.values()) {
    // First, calculate the average color devotion of each deck based on card count.
    // This is a measure of, on average, how many cards of a given color appear in
    // decks with that color identity. A lower percentage means a splash, a higher percentage
    // means it is a primary staple.
    const densitySum = color.deck_percentages.reduce((sum, a) => sum + a, 0);
    const densityCount = color.deck_percentages.length;
    color.average_deck_percentage = Pct(densitySum, densityCount);
    color.victory_points = Math.round(100 * color.victory_points_per_deck.reduce((sum, a) => sum + a, 0)) / 100;

    // Calculate the percentage of all cards drafted that are this color.
    color.total_pick_percentage = Pct(color.cards, totalCards);
    color.build_percent = Pct(color.num_decks, decks.length)
    color.win_percent = Pct(color.wins, color.wins + color.losses)
    color.percent_of_wins = Pct(color.wins, winsByLen[color.color.length])
    if (color.word_count_count > 0) {
      color.avg_word_count = Math.round(color.word_count_sum / color.word_count_count * 100) / 100
    }
  }

  return tracker
}

// ColorPerformanceDeltaChart shows, at a glance, which colors are net positive or
// net negative relative to the cube-wide average win rate. Each bar is a color's
// win rate minus 50%; green bars point up (overperforming), red bars point down.
function ColorPerformanceDeltaChart(input) {
  if (input == null || input.colorData == null) {
    return null
  }

  // Resolve the active color set, honoring the selected bucket the same way the
  // stats table does so the chart and table always agree.
  let colorData = Array.from(input.colorData.values())
  let buckets = input.parsed.colorDataBucketed
  if (buckets.length > 0 && input.selectedBucket !== "ALL") {
    for (let bucket of buckets) {
      if (bucket.name === input.selectedBucket) {
        colorData = Array.from(new Map(Object.entries(bucket.data)).values())
        break
      }
    }
  }

  // Filter to the selected identity length and compute each color's delta, then
  // sort best-to-worst so the bars read left (overperforming) to right.
  let rows = []
  for (let d of colorData) {
    if (!colorIsDisplayed(d.color, input.colorTypeSelection)) {
      continue
    }
    rows.push({ color: d.color, delta: d.win_percent - CUBE_AVG_WIN_PERCENT, winPercent: d.win_percent, numDecks: d.num_decks })
  }
  rows.sort((a, b) => b.delta - a.delta)

  if (rows.length === 0) {
    return null
  }

  const labels = rows.map(r => colorIdentityNames.get(r.color) || r.color)
  const deltas = rows.map(r => r.delta)
  const barColors = rows.map(r => (r.delta >= 0 ? deltaPositiveFill : deltaNegativeFill))

  const data = {
    labels,
    datasets: [
      {
        label: "Win rate vs cube average",
        data: deltas,
        backgroundColor: barColors,
        borderColor: barColors,
        borderWidth: 1,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: "Net performance vs cube average (win %)",
        color: "#FFF",
        font: { size: "16pt" },
      },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function(ctx) {
            let r = rows[ctx.dataIndex]
            let sign = r.delta >= 0 ? "+" : ""
            return `${sign}${r.delta.toFixed(1)}% (win ${r.winPercent.toFixed(0)}%, ${r.numDecks} decks)`
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: "#FFF", font: { size: 14 } }, grid: { display: false } },
      y: {
        title: { display: true, text: "Δ win % vs 50%", color: "#FFF", font: { size: 14 } },
        ticks: { color: "#FFF", font: { size: 14 }, callback: (v) => (v > 0 ? "+" : "") + v + "%" },
        grid: { color: (ctx) => (ctx.tick.value === 0 ? "#FFF" : "rgba(255,255,255,0.1)") },
      },
    },
  }

  return (
    <div className="chart-container">
      <div style={{ "height": "420px" }}>
        <Bar options={options} data={data} />
      </div>
    </div>
  )
}

function ColorRateChart(input) {
  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.parsed.colorDataBucketed;

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
    labels.push(bucket.start)
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
    let stats = new Map(Object.entries(bucket.data))

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
      } else if (input.dataset === "winning_pct") {
        // % of decks of this color with a 2-1 or better record. Denominator
        // is all decks, not just decisive ones - 1-1 / 2-2 decks should pull
        // the rate down, not vanish. Drop buckets with too few decks to carry
        // signal so we don't draw noise.
        let c = stats.get(color)
        let total = c.num_decks || 0
        colorDatasets.get(color).push(total >= MinWinningPctDecks ? Pct(c.top_half || 0, total) : null)
      } else if (input.dataset === "trophy_pct") {
        // % of decks of this color that won a trophy. Use num_decks as the
        // denominator (not top_half + bottom_half, which excludes 2-2 and 1-1
        // results entirely).
        let c = stats.get(color)
        let total = c.num_decks || 0
        colorDatasets.get(color).push(total > 0 ? Math.round(100 * (c.trophies || 0) / total) : 0)
      } else if (input.dataset === "lastplace_pct") {
        let c = stats.get(color)
        let total = c.num_decks || 0
        colorDatasets.get(color).push(total > 0 ? Math.round(100 * (c.last_place || 0) / total) : 0)
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
    case "winning_pct":
      title = `Winning % (bucket size = ${input.bucketSize} drafts)`
      break;
    case "trophy_pct":
      title = `Trophy % (bucket size = ${input.bucketSize} drafts)`
      break;
    case "lastplace_pct":
      title = `Last place % (bucket size = ${input.bucketSize} drafts)`
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
    scales: {x: bucketXScale, y: {min: min, max: max}},
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
    <div style={{"height":"700px"}}>
      <Line height={"300px"} options={options} data={data} />
    </div>
  );
}

const monoColors = ["W", "U", "B", "R", "G"];
const dualColors = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"];
const trioColors = ["WUB", "WUR", "WUG", "WBR", "WBG", "WRG", "UBR", "UBG", "URG", "BRG"];

const colorGroupNames = {
  W: "White", U: "Blue", B: "Black", R: "Red", G: "Green",
  WU: "Azorius", WB: "Orzhov", WR: "Boros", WG: "Selesnya",
  UB: "Dimir", UR: "Izzet", UG: "Simic", BR: "Rakdos", BG: "Golgari", RG: "Gruul",
  WUB: "Esper", WUR: "Jeskai", WUG: "Bant", WBR: "Mardu", WBG: "Abzan",
  WRG: "Naya", UBR: "Grixis", UBG: "Sultai", URG: "Temur", BRG: "Jund",
};

function ColorMatchupHeatmap({ matchupData, colorType }) {
  const [sortColumn, setSortColumn] = React.useState(null);

  if (!matchupData || Object.keys(matchupData).length === 0) {
    return null;
  }

  let groups = dualColors;
  if (colorType === "Mono") groups = monoColors;
  else if (colorType === "Trio") groups = trioColors;

  // Sort rows by win% against the selected column, descending.
  let sortedRows = [...groups];
  if (sortColumn && groups.includes(sortColumn)) {
    sortedRows.sort((a, b) => {
      const aRecord = matchupData[a]?.[sortColumn];
      const bRecord = matchupData[b]?.[sortColumn];
      const aPct = aRecord ? aRecord.win_pct : -1;
      const bPct = bRecord ? bRecord.win_pct : -1;
      return bPct - aPct;
    });
  }

  // Compute cell background color: green for >50%, red for <50%, gray for mirror/low data.
  function cellColor(winPct, totalGames) {
    if (totalGames < 10) return "var(--card-background)";
    // Scale from red (0%) through neutral (50%) to green (100%).
    const t = Math.max(0, Math.min(1, winPct / 100));
    if (t >= 0.5) {
      const g = (t - 0.5) * 2; // 0 to 1
      return `rgba(40, 167, 69, ${0.15 + g * 0.55})`;
    } else {
      const r = (0.5 - t) * 2; // 0 to 1
      return `rgba(220, 53, 69, ${0.15 + r * 0.55})`;
    }
  }

  const title = colorType === "Mono" ? "Mono-Color" : colorType === "Trio" ? "Trio-Color" : "Color Pair";

  return (
    <div>
      <h4 style={{textAlign: "center", color: "var(--primary)", marginBottom: "1rem"}}>
        {title} Matchup Heatmap
      </h4>
      <div style={{overflowX: "auto"}}>
        <table className="widget-table" style={{margin: "0 auto", fontSize: "0.85em"}}>
          <thead>
            <tr>
              <td className="header-cell" style={{minWidth: "70px"}}></td>
              {groups.map(cp => (
                <td key={cp} className="header-cell" style={{
                  textAlign: "center", minWidth: "65px", cursor: "pointer",
                  background: sortColumn === cp ? "var(--primary)" : undefined,
                  color: sortColumn === cp ? "var(--page-background)" : undefined,
                }} onClick={() => setSortColumn(sortColumn === cp ? null : cp)}>
                  {colorGroupNames[cp] || cp}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(myColor => (
              <tr key={myColor} className="widget-table-row">
                <td className="header-cell" style={{fontWeight: "bold"}}>{colorGroupNames[myColor] || myColor}</td>
                {groups.map(oppColor => {
                  if (myColor === oppColor) {
                    return (
                      <td key={oppColor} style={{background: "var(--page-background)", textAlign: "center", color: "var(--text-muted)"}}>
                        -
                      </td>
                    );
                  }
                  const record = matchupData[myColor]?.[oppColor];
                  const wins = record?.wins || 0;
                  const losses = record?.losses || 0;
                  const total = wins + losses;
                  const winPct = total > 0 ? record.win_pct : 0;

                  return (
                    <OverlayTrigger
                      key={oppColor}
                      placement="top"
                      delay={{ show: 100, hide: 100 }}
                      overlay={
                        <Popover id={`matchup-${myColor}-${oppColor}`}>
                          <Popover.Header as="h3">{colorGroupNames[myColor]} vs {colorGroupNames[oppColor]}</Popover.Header>
                          <Popover.Body>
                            {wins}W - {losses}L ({total} games)
                          </Popover.Body>
                        </Popover>
                      }
                    >
                      <td style={{
                        background: cellColor(winPct, total),
                        textAlign: "center",
                        cursor: "default",
                        opacity: total < 10 ? 0.4 : 1,
                      }}>
                        {total > 0 ? `${Math.round(winPct)}%` : ""}
                      </td>
                    </OverlayTrigger>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
