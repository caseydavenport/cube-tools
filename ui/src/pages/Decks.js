import React from 'react'
import { AverageCMC, Pct } from "../utils/Utils.js"
import { Red, Green, Black, White, Blue } from "../utils/Colors.js"
import { Wins, Losses } from "../utils/Deck.js"
import { deckRef } from "../decks/deckModel.js"
import { BucketName, bucketXScale, largeTicks } from "../utils/Buckets.js"
import { DropdownHeader } from "../components/Dropdown.js"

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
import { Scatter, Line, Bar, Pie } from 'react-chartjs-2';
import { currentChartTheme, seriesColor, withAlpha } from "../theme/chartTheme.js"
import { availableValue, hasData, visibleItems } from "../utils/dataKinds.js"

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

// Wins and losses are good and bad, read by functions so Chart.js picks them
// again on a scheme change. In-deck and in-sideboard lines are two series
// colors, which are the same in both schemes.
const winColor = () => currentChartTheme().goodFill
const lossColor = () => currentChartTheme().badFill
const inDeckColor = seriesColor(0)
const inSideboardColor = seriesColor(2)

const NumInteractionOption = "# interaction"
const NumCreaturesOption = "# creatures"
const WinPercentOption = "win %"
const AvgManaValueOption = "avg. mana value"
export const DeckScatterAxes = [
  {label: NumInteractionOption, value: NumInteractionOption},
  {label: NumCreaturesOption, value: NumCreaturesOption},
  {label: WinPercentOption, value: WinPercentOption, needs: ["results"]},
  {label: AvgManaValueOption, value: AvgManaValueOption},
]



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

export function DeckSplits(deck) {
  let creatures = 0
  let interaction = 0

  for (let card of deck.mainboard) {
    if (card.types.includes("Creature")) {
      creatures += 1
    }

    // Interaction - removal and counterspells.
    for (let match of RemovalMatches.concat(CounterspellMatches)) {
      if (card.oracle_text.toLowerCase().match(match)){
        interaction += 1
        break
      }
    }
  }

  return [creatures, interaction]
}

// DECK_CHART_OPTIONS are the charts the two pickers offer. needs lists the data
// a chart is built from: the wins charts need match results, and the
// sideboard size chart needs sideboards.
const DECK_CHART_OPTIONS = [
  { label: "Wins by Mana Cost", value: "wins_mana_cost", needs: ["results"] },
  { label: "Wins by # Creatures", value: "wins_creature", needs: ["results"] },
  { label: "Wins by # Sorceries", value: "wins_sorcery", needs: ["results"] },
  { label: "Wins by # Instants", value: "wins_instant", needs: ["results"] },
  { label: "Wins by # Planeswalkers", value: "wins_planeswalker", needs: ["results"] },
  { label: "Wins by # Enchantments", value: "wins_enchantment", needs: ["results"] },
  { label: "Wins by # Lands", value: "wins_land", needs: ["results"] },
  { label: "Wins by # Non-basic Lands", value: "wins_nonbasic", needs: ["results"] },
  { label: "Wins by # Colors", value: "wins_num_colors", needs: ["results"] },
  { label: "Pie: # Colors", value: "pie_num_colors" },
  { label: "Deck Avg. Mana Value", value: "deck_avg_mana" },
  { label: "Wins by # Counterspells", value: "wins_counterspells", needs: ["results"] },
  { label: "Wins by # Removal", value: "wins_removal", needs: ["results"] },
  { label: "Wins by # Card Draw", value: "wins_card_draw", needs: ["results"] },
  { label: "Wins by # Lifegain", value: "wins_lifegain", needs: ["results"] },
  { label: "Wins by # Graveyard", value: "wins_graveyard", needs: ["results"] },
  { label: "Wins by # Discard", value: "wins_discard", needs: ["results"] },
  { label: "Avg. Basics per Deck", value: "total_basics" },
  { label: "Interaction by Color", value: "interaction_color" },
  { label: "Avg. Removal per-deck", value: "avg_removal" },
  { label: "Avg. Counterspells per-deck", value: "avg_counterspells" },
  { label: "Sideboard Size", value: "sideboard_size", needs: ["sideboards"] },
  { label: "Removal Mana Cost", value: "removal_mana_cost" },
  { label: "Avg. # Colors over time", value: "avg_colors_time" },
  { label: "Deck Scatter Plot", value: "deck_scatter" },
]

export function DeckWidget(input) {
  const [leftChart, setLeftChart] = React.useState("wins_mana_cost")
  const [rightChart, setRightChart] = React.useState("wins_creature")

  if (!input.show) {
    return null
  }

  // Pre-calcualte much of the graph data, to avoid needing to do so multiple times.
  let data = input.graphData

  // Wait for data to be parsed and available before attempting to display any graphs.
  if (!data) {
    return null
  }

  // A chosen chart the cube can't fill falls back to one it can.
  const chartOptions = visibleItems(DECK_CHART_OPTIONS, input.info)
  const left = availableValue(leftChart, DECK_CHART_OPTIONS, input.info)
  const right = availableValue(rightChart, DECK_CHART_OPTIONS, input.info, left)

  const renderChart = (chartId) => {
    switch (chartId) {
      case "wins_mana_cost": return <WinsByManaCost decks={input.decks} data={data} />;
      case "wins_creature": return <WinsByCardType type="Creature" decks={input.decks} />;
      case "wins_sorcery": return <WinsByCardType type="Sorcery" decks={input.decks} />;
      case "wins_instant": return <WinsByCardType type="Instant" decks={input.decks} />;
      case "wins_planeswalker": return <WinsByCardType type="Planeswalker" bucketSize={1} decks={input.decks} />;
      case "wins_enchantment": return <WinsByCardType type="Enchantment" decks={input.decks} />;
      case "wins_land": return <WinsByCardType type="Land" bucketSize={1} decks={input.decks} />;
      case "wins_nonbasic": return <WinsByNonBasicLandDensity decks={input.decks} data={data} />;
      case "wins_num_colors": return <WinsByNumberOfColors decks={input.decks} />;
      case "pie_num_colors": return <NumColorsPieChart decks={input.decks} parsed={input.parsed} />;
      case "deck_avg_mana": return <DeckManaValueChart decks={input.decks} parsed={input.parsed} />;
      case "wins_counterspells": return <WinsByOracleText title="Wins by # counterspells" parsed={input.parsed} decks={input.decks} matches={CounterspellMatches} />;
      case "wins_removal": return <WinsByOracleText title="Wins by # removal spells" parsed={input.parsed} decks={input.decks} matches={RemovalMatches} />;
      case "wins_card_draw": return <WinsByOracleText title="Wins by # card draw spells" parsed={input.parsed} decks={input.decks} matches={cardDrawMatches} />;
      case "wins_lifegain": return <WinsByOracleText title="Wins by # lifegain spells" parsed={input.parsed} decks={input.decks} matches={lifegainMatches} />;
      case "wins_graveyard": return <WinsByOracleText title="Wins by graveyard interaction" parsed={input.parsed} decks={input.decks} matches={["graveyard"]} />;
      case "wins_discard": return <WinsByOracleText title="Wins by # discard spells" parsed={input.parsed} decks={input.decks} matches={["discard"]} />;
      case "total_basics": return <DeckBasicLandCountChart decks={input.decks} parsed={input.parsed} />;
      case "interaction_color": return <OracleTextByColor title="Interaction by color" parsed={input.parsed} data={data} />;
      case "avg_removal": return <OracleTextOverTimeChart info={input.info} title="Avg. removal per-deck" parsed={input.parsed} matches={RemovalMatches} data={data} />;
      case "avg_counterspells": return <OracleTextOverTimeChart info={input.info} title="Avg. counterspells per-deck" parsed={input.parsed} matches={CounterspellMatches} data={data} />;
      case "sideboard_size": return <SideboardSizeOverTimeChart decks={input.decks} parsed={input.parsed} />;
      case "removal_mana_cost": return <ManaCostByOracleTextOverTime info={input.info} title="Removal mana cost" parsed={input.parsed} decks={input.decks} matches={RemovalMatches} data={data} />;
      case "avg_colors_time": return <NumColorsOverTimeChart decks={input.decks} parsed={input.parsed} />;
      case "deck_scatter": return <DeckGraph {...input} />;
      default: return null;
    }
  }

  return (
    <div className="analyze-page">
      <div className="controls-panel">
        <div className="selector-group" style={{"justifyContent": "center"}}>
          <DropdownHeader
            label="Left Chart"
            options={chartOptions}
            value={left}
            onChange={(e) => setLeftChart(e.target.value)}
          />
          <DropdownHeader
            label="Right Chart"
            options={chartOptions}
            value={right}
            onChange={(e) => setRightChart(e.target.value)}
          />
        </div>
      </div>
      <div className="chart-grid">
        {renderChart(left)}
        {renderChart(right)}
      </div>
    </div>
  )
}

// average divides total by count, or gives null for an empty bucket so the
// chart leaves a gap instead of plotting NaN.
function average(total, count) {
  if (count === 0) {
    return null
  }
  return total / count
}

// BuildGraphData is common logic to calculate various bit of data for plotting graphs, so that we don't
// need to iterate the complete data set for each graph.
//
// TODO: Ideally we'd move this into the API server.
export function BuildGraphData(parsed) {
  let buckets = parsed.deckBuckets
  let colors = ["W", "U", "B", "R", "G"]

  // Build a set of labels for each bucket.
  const labels = []
  for (let bucket of buckets) {
    labels.push(BucketName(bucket))
  }

  // Pre-calculate statistics for each filtered deck.
  const deckStatsMap = new Map()
  for (let deck of parsed.filteredDecks) {
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

    let mbCounterspells = 0
    let sbCounterspells = 0
    let removal = {
      mb: { cmc: 0, count: 0 },
      sb: { cmc: 0, count: 0 },
    }
    let interaction = {
      mb: { byColor: new Map() },
    }

    for (let card of deck.mainboard) {
      let isCounterspell = false
      let isRemoval = false
      const oracle = (card.oracle_text || "").toLowerCase()

      for (let match of CounterspellMatches) {
        if (oracle.includes(match)) {
          mbCounterspells += 1
          isCounterspell = true
          break
        }
      }

      for (let match of RemovalMatches) {
        if (oracle.includes(match)) {
          removal.mb.count += 1
          removal.mb.cmc += card.cmc
          isRemoval = true
          break
        }
      }

      if (isRemoval || isCounterspell) {
        for (let color of card.colors) {
          interaction.mb.byColor.set(color, (interaction.mb.byColor.get(color) || 0) + 1)
        }
      }
    }

    for (let card of (deck.sideboard || [])) {
      const oracle = (card.oracle_text || "").toLowerCase()
      for (let match of CounterspellMatches) {
        if (oracle.includes(match)) {
          sbCounterspells += 1
          break
        }
      }
      for (let match of RemovalMatches) {
        if (oracle.includes(match)) {
          removal.sb.count += 1
          removal.sb.cmc += card.cmc
          break
        }
      }
    }

    deckStatsMap.set(deckRef(deck), {
      wins: Wins(deck),
      losses: Losses(deck),
      mbCounterspells,
      sbCounterspells,
      removal,
      interaction
    })
  }

  // Calculate statistics across all decks.
  var all = {
    winsByCMC: new Map(),
    lossesByCMC: new Map(),
    winsByNonBasicLands: new Map(),
    lossesByNonBasicLands: new Map(),
    nonBasicLandsBucketSize: 2,
  }
  for (let deck of parsed.filteredDecks) {
    const stats = deckStatsMap.get(deckRef(deck))
    if (!stats) continue

    let wins = stats.wins
    let losses = stats.losses

    if (deck.avg_cmc === null) {
      continue
    }

    let cmc = Math.round(4 * deck.avg_cmc) / 4
    all.winsByCMC.set(cmc, (all.winsByCMC.get(cmc) || 0) + wins)
    all.lossesByCMC.set(cmc, (all.lossesByCMC.get(cmc) || 0) + losses)

    if (!deck.mainboard || deck.mainboard.length === 0) {
      continue
    }

    let numNonBasicLands = 0
    for (let card of deck.mainboard) {
      if (card.types.includes("Land") && !card.types.includes("Basic")) {
        numNonBasicLands += 1
      }
    }
    let bucket = Math.round(numNonBasicLands/all.nonBasicLandsBucketSize) * all.nonBasicLandsBucketSize
    all.winsByNonBasicLands.set(bucket, (all.winsByNonBasicLands.get(bucket) || 0) + wins)
    all.lossesByNonBasicLands.set(bucket, (all.lossesByNonBasicLands.get(bucket) || 0) + losses)
  }

  // Calculate per-bucket, over time data.
  const bucketed = {
    mbCounterspells: [],
    sbCounterspells: [],
    removal: {
      mb: { count: [], cmc: [] },
      sb: { count: [], cmc: [] },
    },
    interaction: {
      mb: {
        byColor: new Map([
          ["W", []], ["U", []], ["B", []], ["R", []], ["G", []],
        ]),
      },
    }
  }

  for (let bucket of buckets) {
    let mbCounterspells = 0
    let sbCounterspells = 0
    let removalCountMB = 0
    let removalCMCMB = 0
    let removalCountSB = 0
    let removalCMCSB = 0
    let interactionMBByColor = new Map()
    let deckCount = 0

    for (let draft of bucket) {
      for (let deck of draft.decks) {
        const stats = deckStatsMap.get(deckRef(deck))
        if (!stats) continue
        deckCount++
        mbCounterspells += stats.mbCounterspells
        sbCounterspells += stats.sbCounterspells
        removalCountMB += stats.removal.mb.count
        removalCMCMB += stats.removal.mb.cmc
        removalCountSB += stats.removal.sb.count
        removalCMCSB += stats.removal.sb.cmc
        for (let [color, count] of stats.interaction.mb.byColor) {
          interactionMBByColor.set(color, (interactionMBByColor.get(color) || 0) + count)
        }
      }
    }

    if (deckCount === 0) deckCount = 1 // avoid div by zero

    bucketed.mbCounterspells.push(mbCounterspells / deckCount)
    bucketed.sbCounterspells.push(sbCounterspells / deckCount)
    bucketed.removal.mb.count.push(removalCountMB / deckCount)
    bucketed.removal.sb.count.push(removalCountSB / deckCount)
    bucketed.removal.mb.cmc.push(removalCMCMB / (removalCountMB || 1))
    bucketed.removal.sb.cmc.push(removalCMCSB / (removalCountSB || 1))

    for (let color of colors) {
      let v = bucketed.interaction.mb.byColor.get(color)
      v.push((interactionMBByColor.get(color) || 0) / (parsed.bucketSize || 1))
      bucketed.interaction.mb.byColor.set(color, v)
    }
  }

  return { labels, all, bucketed }
}

function WinsByManaCost(input) {
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

  // Pull out the wins / losses by CMC data from the input.
  let winsByCMC = input.data.all.winsByCMC
  let lossesByCMC = input.data.all.lossesByCMC

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
    percentages.push(Pct(winsByCMC.get(l), winsByCMC.get(l) + lossesByCMC.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },
    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
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
    // Skip decks with no mainboard.
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

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
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function WinsByNonBasicLandDensity(input) {
  let wins = input.data.all.winsByNonBasicLands
  let losses = input.data.all.lossesByNonBasicLands

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
        text: "Wins by # nonbasic lands",
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

  const sorted = [...wins.keys()].sort(function(a, b) {return a - b})
  let labels = []
  for (let start of sorted) {
    labels.push(`${start}-${start+input.data.all.nonBasicLandsBucketSize}`)
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
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function WinsByOracleText(input) {
  let bucketSize = 3
  let wins = new Map()
  let losses = new Map()
  for (let deck of input.decks) {
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

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
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },

    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
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
    percentages.push(Pct(wins.get(l), wins.get(l) + losses.get(l)))
  }

  const data = {
    labels,
    datasets: [
      {
        type: "line",
        label: 'Win %',
        data: percentages,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
      {
        type: "bar",
        label: 'Wins',
        data: winsData,
        backgroundColor: winColor,
      },
      {
        type: "bar",
        label: 'Losses',
        data: lossData,
        backgroundColor: lossColor,
      },
    ],
  };

  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Bar height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function OracleTextByColor(input) {

  const labels = input.data.labels

  let valuesByColor = input.data.bucketed.interaction.mb.byColor

  let dataset = [
      {
        label: 'W',
        data: valuesByColor.get("W"),
        borderColor: White,
        backgroundColor: White,
      },
      {
        label: 'U',
        data: valuesByColor.get("U"),
        borderColor: Blue,
        backgroundColor: Blue,
      },
      {
        label: 'B',
        data: valuesByColor.get("B"),
        borderColor: Black,
        backgroundColor: Black,
      },
      {
        label: 'R',
        data: valuesByColor.get("R"),
        borderColor: Red,
        backgroundColor: Red,
      },
      {
        label: 'G',
        data: valuesByColor.get("G"),
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
        text: input.title + ` (bucket size = ${input.parsed.bucketSize} drafts)`,
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

function OracleTextOverTimeChart(input) {

  let mbValues = []
  let sbValues = []
  if (input.matches == RemovalMatches) {
    mbValues = input.data.bucketed.removal.mb.count
    sbValues = input.data.bucketed.removal.sb.count
  } else if (input.matches == CounterspellMatches) {
    mbValues = input.data.bucketed.mbCounterspells
    sbValues = input.data.bucketed.sbCounterspells
  }

  let dataset = [
      {
        label: 'Avg. per-deck',
        data: mbValues,
        borderColor: inDeckColor,
        backgroundColor: inDeckColor,
      },
  ]

  // The sideboard line needs sideboards, which some cubes don't record.
  if (hasData(input.info, "sideboards")) {
    dataset.push({
      label: 'Avg. per-sideboard',
      data: sbValues,
      borderColor: inSideboardColor,
      backgroundColor: inSideboardColor,
    })
  }

  // Find the minimum Y value, to set the scale appropriately.
  let minY = 10
  for (let v of mbValues) {
    if (v < minY) {
      minY = v
    }
  }
  for (let v of sbValues) {
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
        text: input.title + ` (bucket size = ${input.parsed.bucketSize} drafts)`,
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

  const labels = input.data.labels
  const data = {labels, datasets: dataset};
  return (
    <div style={{"height":"700px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

function DeckManaValueChart(input) {
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
        label: 'Average Mana Value',
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
        text: `Deck Avg. Mana Value (bucket size = ${input.parsed.bucketSize} drafts)`,
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

function DeckBasicLandCountChart(input) {
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
        label: 'Plains',
        data: lands.get("Plains"),
        borderColor: White,
        backgroundColor: White,
      },
      {
        label: 'Islands',
        data: lands.get("Island"),
        borderColor: Blue,
        backgroundColor: Blue,
      },
      {
        label: 'Swamps',
        data: lands.get("Swamp"),
        borderColor: Black,
        backgroundColor: Black,
      },
      {
        label: 'Mountains',
        data: lands.get("Mountain"),
        borderColor: Red,
        backgroundColor: Red,
      },
      {
        label: 'Forests',
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
        text: `Avg. basics per deck (bucket size = ${input.parsed.bucketSize} drafts)`,
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

function SideboardSizeOverTimeChart(input) {
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
        label: 'Avg. sideboard size',
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
        text: `Sideboard size (bucket size = ${input.parsed.bucketSize} drafts)`,
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

function NumColorsOverTimeChart(input) {
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
        label: 'Avg. # colors',
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
        text: `# Colors per-deck (bucket size = ${input.parsed.bucketSize} drafts)`,
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

function ManaCostByOracleTextOverTime(input) {

  const labels = input.data.labels

  let mbValues = input.data.bucketed.removal.mb.cmc
  let sbValues = input.data.bucketed.removal.sb.cmc

  let dataset = [
      {
        label: 'Avg. in-deck',
        data: mbValues,
        borderColor: inDeckColor,
        backgroundColor: inDeckColor,
      },
  ]

  // The sideboard line needs sideboards, which some cubes don't record.
  if (hasData(input.info, "sideboards")) {
    dataset.push({
      label: 'Avg. in-sideboard',
      data: sbValues,
      borderColor: inSideboardColor,
      backgroundColor: inSideboardColor,
    })
  }

  // Find the minimum Y value, to set the scale appropriately.
  let minY = 10
  for (let v of mbValues) {
    if (v < minY) {
      minY = v
    }
  }
  for (let v of sbValues) {
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
        text: input.title + ` (bucket size = ${input.parsed.bucketSize} drafts)`,
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


// deckPointColor colors one deck on the scatter plot: the selected deck in
// the text color, every other deck in the first series color.
function deckPointColor(kind) {
  if (kind === "selected") {
    return currentChartTheme().text
  }
  return seriesColor(0)
}

function DeckGraph(input) {

  // Determine what to show on each axis.
  // A remembered axis the cube can't fill (win % without results) falls back
  // to one it can.
  let xAxis = availableValue(input.xAxis, DeckScatterAxes, input.info)
  let yAxis = availableValue(input.yAxis, DeckScatterAxes, input.info, xAxis)

  // Labels for each data point.
  var labels = []
  var pointKinds = []
  var sizes = []

  let name = yAxis + " vs. " + xAxis

  // values is an array of maps with keys 'x' and 'y'.
  var values = []
  for (let deck of input.parsed.filteredDecks) {
    if (!deck.mainboard || deck.mainboard.length == 0) {
      continue
    }

    var x = null
    var y = null

    x = getValue(xAxis, deck, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)
    y = getValue(yAxis, deck, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)

    if (x === null || y === null) {
      continue
    }

    let name = deck.player + " (" + deck.date + ")"
    labels.push(name)

    // The selected deck stands out in the text color.
    if (name === input.selectedCard) {
      pointKinds.push("selected")
      sizes.push(10)
    } else {
      pointKinds.push("plain")
      sizes.push(3)
    }
    values.push({"x": x, "y": y})
  }

  let dataset = [
      {
        label: "All decks",
        data: values,
        // A function, so Chart.js colors the points again when the scheme changes.
        pointBackgroundColor: ctx => deckPointColor(pointKinds[ctx.dataIndex]),
        pointRadius: sizes,
        pointHoverRadius: 10,
      },
  ]


  let title = `${name} (all drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: function(evt, element) {},
    scales: {
      y: {
        title: {display: true, text: yAxis, font: {size: 20, weight: "bold"}},
        min: getScales(yAxis, false)[0],
        max: getScales(yAxis, false)[1],
        ticks: largeTicks,
      },
      x: {
        title: {display: true, text: xAxis, font: {size: 20, weight: "bold"}},
        min: getScales(xAxis, false)[0],
        max: getScales(xAxis, false)[1],
        ticks: largeTicks,
      },
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
    <div className="chart-container">
      <div className="selector-group" style={{"justifyContent": "center", "marginBottom": "1rem"}}>
        <DropdownHeader
          label="X Axis"
          options={visibleItems(DeckScatterAxes, input.info)}
          value={xAxis}
          onChange={input.onXAxisSelected}
        />
        <DropdownHeader
          label="Y Axis"
          options={visibleItems(DeckScatterAxes, input.info)}
          value={yAxis}
          onChange={input.onYAxisSelected}
        />
      </div>

      <div align="center" style={{"minHeight": "700px"}}>
        <Scatter className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

function getScales(axis, force) {
  // TODO: Can uncomment this when there are % based stat options.
  // if (force) {
  //   switch (axis) {
  //     case NumInteractionOption:
  //     case NumCreaturesOption:
  //       return [0, 100]
  //   }
  // }
  return [null, null]
}

function getValue(axis, deck, archetypeData, playerData, decks, draftData) {
  let [creatures, interaction] = DeckSplits(deck)

  switch (axis) {
    case NumInteractionOption:
      return interaction
    case NumCreaturesOption:
      return creatures
    case WinPercentOption:
      return Pct(Wins(deck), Wins(deck) + Losses(deck))
    case AvgManaValueOption:
      return AverageCMC({deck: deck})
  }
  return null
}

function NumColorsPieChart(input) {
  let title = `# Colors`
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
