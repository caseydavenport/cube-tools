import React from 'react'
import { DropdownHeader } from "../components/Dropdown.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { asEvent } from "../components/kit/controls.js"
import { Group, SegmentedControl } from "@mantine/core"
import { availableValue, hasData, visibleItems } from "../utils/dataKinds.js"
import { goodBadTint } from "../stats/tints.js"
import { Colors, ColorImages, GetColorIdentity, primaryColorPair, CUBE_AVG_WIN_PERCENT, guildColor } from "../utils/Colors.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
import { bucketXScale } from "../utils/Buckets.js"
import { AverageWordCount, CountManaPips, IsBasicLand, MinWinningPctDecks, Pct, SortFunc } from "../utils/Utils.js"


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
import { deltaFill, zeroLineGrid } from "../theme/chartTheme.js"
import { colorName } from "../utils/colorNames.js"

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

// CHART_OPTIONS are the measures the two charts over time can show. needs
// lists the data a measure is built from, so a cube without it doesn't offer it.
const CHART_OPTIONS = [
  { label: "Build %", value: "builds" },
  { label: "Win %", value: "wins", needs: ["results"] },
  { label: "Pick %", value: "pick_percentage" },
  { label: "Avg Deck Devotion", value: "splash" },
  { label: "VP %", value: "vps_pct", needs: ["results"] },
  { label: "Victory Points", value: "vps", needs: ["results"] },
  { label: "% of wins", value: "percent_of_wins", needs: ["results"] },
  { label: "Winning %", value: "winning_pct", needs: ["results"] },
  { label: "Trophy %", value: "trophy_pct", needs: ["results"] },
  { label: "Last Place %", value: "lastplace_pct", needs: ["results"] },
]

// chartLabel returns the label of a chart option, for its card's title.
function chartLabel(value) {
  for (const option of CHART_OPTIONS) {
    if (option.value === value) {
      return option.label
    }
  }
  return ""
}

// ColorWidget is the Colors page: the stats table by color, two charts over
// time side by side, and, for cubes with match results, the win rate against
// the cube average and the matchup heatmap.
export function ColorWidget(input) {
  const [leftChart, setLeftChart] = React.useState("builds")
  const [rightChart, setRightChart] = React.useState("wins")

  if (!input.show) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const options = visibleItems(CHART_OPTIONS, input.info)
  const left = availableValue(leftChart, CHART_OPTIONS, input.info)
  const right = availableValue(rightChart, CHART_OPTIONS, input.info, left)

  return (
    <div className="analyze-page colors-grid">
      <div className="colors-wide">
        <SectionCard title={input.copy.colorStats} action={<TableHeader {...input} />}>
          <ColorStatsTable
            parsed={input.parsed}
            colorData={input.parsed.colorData}
            colorTypeSelection={input.colorTypeSelection}
            decks={input.decks}
            onClick={input.onHeaderClick}
            sortBy={input.colorSortBy}
            selectedBucket={input.selectedBucket}
            info={input.info}
          />
        </SectionCard>
      </div>

      <RateChartCard {...input} dataset={left} options={options} onChange={setLeftChart} />
      <RateChartCard {...input} dataset={right} options={options} onChange={setRightChart} />

      <ResultsCharts {...input} />
    </div>
  );
}

// RateChartCard is one of the two charts over time, in a card titled with what
// it shows and a dropdown in the corner to pick another measure.
function RateChartCard(input) {
  const picker = (
    <DropdownHeader
      label=""
      options={input.options}
      value={input.dataset}
      onChange={(e) => input.onChange(e.target.value)}
    />
  )

  return (
    <SectionCard title={chartLabel(input.dataset)} action={picker}>
      <ColorRateChart
        parsed={input.parsed}
        colorData={input.parsed.colorData}
        decks={input.decks}
        dataset={input.dataset}
        colorMode={input.colorTypeSelection}
        bucketSize={input.bucketSize}
      />
    </SectionCard>
  )
}

// ResultsCharts are the win rate against the cube average and the matchup
// heatmap. Both are built from match results, so cubes without them skip both.
function ResultsCharts(input) {
  if (!hasData(input.info, "results")) {
    return null
  }

  return (
    <>
      <div className="colors-wide">
        <ColorPerformanceDeltaChart
          parsed={input.parsed}
          colorData={input.parsed.colorData}
          colorTypeSelection={input.colorTypeSelection}
          selectedBucket={input.selectedBucket}
        />
      </div>

      <div className="colors-wide kit-card colors-chart-card">
        <ColorMatchupHeatmap matchupData={input.colorMatchupData} colorType={input.colorTypeSelection} />
      </div>
    </>
  )
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

// COLOR_COLUMNS are the stats table's columns. Each one draws its own header
// and cell; needs lists the data a column is built from, and monoOnly marks a
// column that only makes sense for single colors.
const COLOR_COLUMNS = [
  {
    id: "color",
    text: "Color",
    tip: "The color or colors of the deck. If 'strict' is checked, the row includes data only from decks that are exactly this color. Otherwise, the row includes data from any decks that include this color/colors.",
    cell: (color) => <td key="color">{ColorImages(color.color)}</td>,
  },
  {
    id: "win",
    text: "Win %",
    tip: "Percentage of games played by this color/colors that were wins. Greyed when it can't be told apart from a coin flip at the chosen confidence; hover for the interval.",
    needs: ["results"],
    cell: (color) => <WinPercentCell key="win" color={color} />,
  },
  {
    id: "delta",
    text: "Δ vs avg",
    tip: "Win rate relative to the cube-wide average (50%). Positive (green) means this color wins more than its share of games; negative (red) means it loses more.",
    needs: ["results"],
    cell: (color) => <DeltaCell key="delta" color={color} />,
  },
  {
    id: "build",
    text: "Build %",
    tip: "Percentages of all built decks that include this color/colors.",
    cell: (color) => <td key="build">{color.build_percent.toFixed(0)}%</td>,
  },
  {
    id: "pwin",
    text: "% of wins",
    tip: "Share of wins among rows of this same identity length (mono, dual, tri). Sums to ~100% within each view.",
    needs: ["results"],
    cell: (color) => <td key="pwin">{color.percent_of_wins.toFixed(0)}%</td>,
  },
  {
    id: "vps",
    text: "Victory point %",
    tip: "Weighted win contribution of this color, as a percentage of total wins across all decks.",
    needs: ["results"],
    cell: (color, totals) => <td key="vps">{Pct(color.victory_points, totals.victoryPoints)}%</td>,
  },
  {
    id: "trophies",
    text: "Trophies",
    tip: "Number of 3-0 decks of this color.",
    needs: ["results"],
    cell: (color) => <td key="trophies">{color.trophies}</td>,
  },
  {
    id: "lastplace",
    text: "Last place",
    tip: "Number of 0-3 decks of this color.",
    needs: ["results"],
    cell: (color) => <td key="lastplace">{color.last_place}</td>,
  },
  {
    id: "winning",
    text: "Winning",
    tip: "Number of 2-1 or better.",
    needs: ["results"],
    cell: (color) => <td key="winning">{color.top_half}</td>,
  },
  {
    id: "losing",
    text: "Losing",
    tip: "Number of 1-2 or worse.",
    needs: ["results"],
    cell: (color) => <td key="losing">{color.bottom_half}</td>,
  },
  {
    id: "winning_pct",
    text: "Winning %",
    tip: "Percentage of decks with a 2-1 or better match record.",
    needs: ["results"],
    cell: (color) => <td key="winning_pct">{winningPercentText(color)}</td>,
  },
  {
    id: "decks",
    text: "# Decks",
    tip: "Number of decks in this row.",
    cell: (color) => <td key="decks">{color.num_decks}</td>,
  },
  {
    id: "picks",
    text: "Pick %",
    tip: "This color's share of all mainboarded cards across every deck. Sums to ~100% across rows.",
    monoOnly: true,
    cell: (color) => <td key="picks">{color.total_pick_percentage}%</td>,
  },
  {
    id: "splash",
    text: "Avg Deck Devotion",
    tip: "For each deck, the fraction of colored mana symbols matching this color identity, then averaged across decks. Each deck contributes equally regardless of size.",
    cell: (color) => <td key="splash">{color.average_deck_percentage}%</td>,
  },
  {
    id: "avg_word_count",
    text: "Avg Words",
    tip: "Average word count per non-land card in decks with this color, excluding reminder text.",
    cell: (color) => <td key="avg_word_count">{color.avg_word_count || 0}</td>,
  },
]

// shownColumns returns the stats table's columns for this cube and color type:
// columns needing data the cube lacks are dropped, as are single-color columns
// when pairs or trios are shown. Header and cells both come from this list.
function shownColumns(info, colorType) {
  const columns = []
  for (const column of visibleItems(COLOR_COLUMNS, info)) {
    if (column.monoOnly && colorType !== "Mono") {
      continue
    }
    columns.push(column)
  }
  return columns
}

// winningPercentText is the share of decks with a winning record, or a dash
// for colors with too few decks to say.
function winningPercentText(color) {
  if (color.num_decks < MinWinningPctDecks) {
    return "—"
  }
  return Pct(color.top_half, color.num_decks) + "%"
}

// WinPercentCell shows a color's win rate, greyed when it can't be told apart
// from a coin flip, with the confidence interval on hover.
function WinPercentCell({ color }) {
  const hasCI = color.win_percent_low != null

  let style = undefined
  let title = undefined
  if (hasCI) {
    if (!color.significant) {
      style = { color: "var(--text-muted)" }
    }
    let verdict = "not distinguishable from 50%"
    if (color.significant) {
      verdict = "distinguishable from 50%"
    }
    title = `${color.win_percent_low.toFixed(0)}–${color.win_percent_high.toFixed(0)}% · ${verdict}`
  }

  return <td style={style} title={title}>{color.win_percent.toFixed(0)}%</td>
}

// DeltaCell shows a color's win rate above or below the cube average, signed
// and colored good or bad.
function DeltaCell({ color }) {
  const delta = color.win_percent - CUBE_AVG_WIN_PERCENT

  let className = "negative"
  let sign = ""
  if (delta >= 0) {
    className = "positive"
    sign = "+"
  }
  return <td className={className}>{sign + delta.toFixed(0) + "%"}</td>
}

// colorSortValue is the value a row sorts by for the chosen column, win rate
// unless another column was clicked.
function colorSortValue(color, sortBy) {
  if (sortBy === "delta") {
    return color.win_percent - CUBE_AVG_WIN_PERCENT
  } else if (sortBy === "build") {
    return color.build_percent
  } else if (sortBy === "decks") {
    return color.num_decks
  } else if (sortBy === "color") {
    return color.color
  } else if (sortBy === "picks") {
    return color.total_pick_percentage
  } else if (sortBy === "splash") {
    return color.average_deck_percentage
  } else if (sortBy === "pwin") {
    return color.percent_of_wins
  } else if (sortBy === "vps") {
    return color.victory_points
  } else if (sortBy === "trophies") {
    return color.trophies
  } else if (sortBy === "lastplace") {
    return color.last_place
  } else if (sortBy === "winning") {
    return color.top_half
  } else if (sortBy === "losing") {
    return color.bottom_half
  } else if (sortBy === "winning_pct") {
    if (color.num_decks >= MinWinningPctDecks) {
      return color.top_half / color.num_decks
    }
    return -1
  } else if (sortBy === "avg_word_count") {
    return color.avg_word_count || 0
  }
  return color.win_percent
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

  const columns = shownColumns(input.info, input.colorTypeSelection)
  const totals = { victoryPoints: totalVictoryPoints }

  return (
    <div className="stats-table-wrap">
      <table className="widget-table">
        <thead className="table-header">
          <tr key="header">
            {
              columns.map(function(hdr) {
                return (
                  <HoverInfo key={hdr.id} title={hdr.text} info={hdr.tip}>
                    <td onClick={input.onClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                  </HoverInfo>
                );
              })
            }
          </tr>
        </thead>
        <tbody>
          {
            filtered.map(function(color, idx) {
              return (
                <tr key={idx} sort={colorSortValue(color, input.sortBy)} className="widget-table-row">
                  {columns.map(column => column.cell(color, totals))}
                </tr>
              );
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

// TableHeader holds the stats table's controls: mono, pairs, or trios; which
// time bucket to look at; and how a deck's colors are counted.
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
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <SegmentedControl
        size="xs"
        aria-label="Color type"
        data={input.ddOpts}
        value={input.colorTypeSelection}
        onChange={value => input.onSelected(asEvent(value))}
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
    </Group>
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

    // Count the colored mana symbols in the deck (its true devotion), so we can
    // measure how much a deck leans on each color by mana cost rather than card count.
    let pips = CountManaPips(decks[i].mainboard)
    let totalPips = pips.W + pips.U + pips.B + pips.R + pips.G

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

      // Track this color's devotion in the deck: the share of colored mana symbols
      // that belong to it, summed over the letters of its identity (e.g. "WU" -> W + U pips).
      if (totalPips > 0) {
        let colorPips = 0
        for (let c of color) {
          colorPips += pips[c]
        }
        tracker.get(color).deck_percentages.push(colorPips / totalPips)
      }

      // The percentage of cards in the deck that belong to this color, used to
      // weight wins into victory points.
      let deckFrac = num / totalCardsInDeck

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
    // First, calculate the average color devotion of each deck based on colored mana symbols.
    // This is a measure of, on average, what share of a deck's mana pips are a given color in
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

  const labels = rows.map(r => colorName(r.color))
  const deltas = rows.map(r => r.delta)
  // A function, so Chart.js picks the bar colors again when the scheme changes.
  const barColors = ctx => deltaFill(rows[ctx.dataIndex].delta)

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
      x: { ticks: { font: { size: 14 } }, grid: { display: false } },
      y: {
        title: { display: true, text: "Δ win % vs 50%", font: { size: 14 } },
        ticks: { font: { size: 14 }, callback: (v) => (v > 0 ? "+" : "") + v + "%" },
        grid: { color: (ctx) => zeroLineGrid(ctx) },
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

  let monoColorDatasets = [
      {
        label: 'White',
        data: colorDatasets.get("W"),
        borderColor: Colors.get("W"),
        backgroundColor: Colors.get("W"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Blue',
        data: colorDatasets.get("U"),
        borderColor: Colors.get("U"),
        backgroundColor: Colors.get("U"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Black',
        data: colorDatasets.get("B"),
        borderColor: Colors.get("B"),
        backgroundColor: Colors.get("B"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Red',
        data: colorDatasets.get("R"),
        borderColor: Colors.get("R"),
        backgroundColor: Colors.get("R"),
        hoverBorderWidth: hoverBorderWidth,
      },
      {
        label: 'Green',
        data: colorDatasets.get("G"),
        borderColor: Colors.get("G"),
        backgroundColor: Colors.get("G"),
        hoverBorderWidth: hoverBorderWidth,
      },
  ]

  // Generate a dual-color dataset as well.
  let dualColorDatasets = []
  for (let color of dualColors) {
    dualColorDatasets.push({
      label: colorName(color),
      data: colorDatasets.get(color),
      borderColor: guildColor(color),
      backgroundColor: guildColor(color),
      hoverBorderWidth: hoverBorderWidth,
    })
  }

  let triColorDatasets = []
  for (let color of triColors) {
    triColorDatasets.push({
      label: colorName(color),
      data: colorDatasets.get(color),
      borderColor: guildColor(color),
      backgroundColor: guildColor(color),
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
    // Scale from bad (0%) through neutral (50%) to good (100%).
    return goodBadTint((winPct - 50) / 50);
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
                    <HoverInfo key={oppColor} title={<>{colorGroupNames[myColor]} vs {colorGroupNames[oppColor]}</>} info={<>{wins}W - {losses}L ({total} games)</>}>
                      <td style={{
                        background: cellColor(winPct, total),
                        textAlign: "center",
                        cursor: "default",
                        opacity: total < 10 ? 0.4 : 1,
                      }}>
                        {total > 0 ? `${Math.round(winPct)}%` : ""}
                      </td>
                    </HoverInfo>
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
