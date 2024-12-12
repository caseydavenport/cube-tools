import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { Wins, Losses } from "../utils/Deck.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { CardData, CardAnalyze } from "../utils/Cards.js"
import { BucketName, BucketWins } from "../utils/Buckets.js"

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
import { Line, Bar, Scatter } from 'react-chartjs-2';

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

const chartHeight = "425px"
const chartWidth = "300px"

export const NumDecksOption = "# Decks"
export const NumSideboardOption = "# Sideboard"
export const MainboardPercentOption = "Mainboard %"
export const SideboardPercentOption = "Sideboard %"
export const WinPercentOption = "Win %"
export const PercentOfWinsOption = "% of Wins"
export const ExpectedWinPercentOption = "Expected Win %"
export const ELOOption = "Pick ELO"
export const NumGamesOption = "# Games"
export const ManaValueOption = "Mana Value"
export const NumPlayersOption = "# Players"
export const DraftOrderOption = "Avg. draft pick"
export const CardScatterAxes = [
  {label: NumDecksOption, value: NumDecksOption},
  {label: NumSideboardOption, value: NumSideboardOption},
  {label: MainboardPercentOption, value: MainboardPercentOption},
  {label: SideboardPercentOption, value: SideboardPercentOption},
  {label: WinPercentOption, value: WinPercentOption},
  {label: PercentOfWinsOption, value: PercentOfWinsOption},
  {label: ExpectedWinPercentOption, value: ExpectedWinPercentOption},
  {label: ELOOption, value: ELOOption},
  {label: NumGamesOption, value: NumGamesOption},
  {label: ManaValueOption, value: ManaValueOption},
  {label: NumPlayersOption, value: NumPlayersOption},
  {label: DraftOrderOption, value: DraftOrderOption},
]


export function CardWidget(input) {
  if (!input.show) {
    return null
  }

  return (
    <table style={{"width": "100%"}}>
      <tbody>
        <tr style={{"height": "800px"}}>
          <td style={{"width": "45%", "verticalAlign": "top"}}>
            <CardWidgetTable {...input} />
          </td>
          <td style={{"width": "10%", "verticalAlign": "top"}}>
            <UndraftedWidget {...input} />
          </td>
          <td style={{"width": "40%", "position": "fixed", "verticalAlign": "top"}}>
            <PlayRateChart {...input} />
            <WinrateChart {...input} />
            <ELOChart {...input} />
          </td>
        </tr>

        <tr style={{"height": "800px"}}>
          <td>
            <CardGraph {...input} />
          </td>
        </tr>

      </tbody>
    </table>
  );
}

function CardWidgetTable(input) {

  // shouldSkip returns true if the card should be skipped, and false otherwise.
  function shouldSkip(card) {
    if (card.players.size < input.minPlayers) {
      return true
    }
    if (input.maxPlayers != 0 && card.players.size > input.maxPlayers) {
      return true
    }
    if (input.manaValue >=0 && card.cmc != input.manaValue) {
      return true
    }
    return false
  }

  // Convert the cardData map to a list for sorting purposes.
  let cards = []
  for (let [name, card] of input.parsed.cardData) {
    cards.push(card)
  }

  if (input.dropdownSelection === "Mainboard rate") {
    return (
      <div className="scroll-container-large">
        <CardWidgetOptions {...input} />
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td className="header-cell">Card</td>
              <td onClick={input.onHeaderClick} id="mainboarded" className="header-cell">Deck%</td>
              <td onClick={input.onHeaderClick} id="wins" className="header-cell">Win%</td>
              <td onClick={input.onHeaderClick} id="mb" className="header-cell"># M</td>
              <td onClick={input.onHeaderClick} id="sb" className="header-cell"># S</td>
              <td onClick={input.onHeaderClick} id="in-color-sb" className="header-cell"># S (playable)</td>
              <td onClick={input.onHeaderClick} id="games" className="header-cell"># Games</td>
              <td onClick={input.onHeaderClick} id="elo" className="header-cell">ELO</td>
              <td onClick={input.onHeaderClick} id="lastPlayed" className="header-cell">Last played</td>
            </tr>
          </thead>
          <tbody>
          {
            cards.map(function(card) {
              if (shouldSkip(card)) {
                return
              }

              // Determine sort order.
              let sort = card.mainboard_percent
              switch (input.sortBy) {
                case "mainboarded":
                  sort = card.mainboard_percent
                  break
                case "games":
                  sort = card.total_games
                  break
                case "mb":
                  sort = card.mainboard
                  break
                case "sb":
                  sort = card.sideboard
                  break
                case "elo":
                  sort = card.elo
                  break
                case "in-color-sb":
                  sort = card.playableSideboard
                  break
                case "lastPlayed":
                  sort = card.lastMainboarded
                  break
                case "appearances":
                  sort = card.appearances
                  break
                case "wins":
                  sort = card.win_percent
                  break
              }

              return (
                <tr sort={sort} className="card" key={card.name}>
                  <td id={card.name} onClick={input.onCardSelected} className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td id={card.name} onClick={input.onCardSelected} key="name">{card.mainboard_percent}%</td>
                  <td id={card.name} onClick={input.onCardSelected} key="win_percent">{card.win_percent}%</td>
                  <td><ApplyTooltip text={card.mainboard} hidden={CardMainboardTooltipContent(card)}/></td>
                  <td>{card.sideboard}</td>
                  <td>{card.playableSideboard}</td>
                  <td>{card.total_games}</td>
                  <td>{card.elo}</td>
                  <td>{card.lastMainboarded}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
          </tbody>
        </table>
      </div>
    );
  } else {
    return (
      <div className="widget-scroll" style={{"maxHeight": "1200px"}}>
        <CardWidgetOptions {...input} />
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onHeaderClick} id="wins" className="header-cell">Win %</td>
              <td onClick={input.onHeaderClick} id="pow" className="header-cell">% of Wins</td>
              <td onClick={input.onHeaderClick} id="card" className="header-cell">Card</td>
              <td onClick={input.onHeaderClick} id="relativePerfArch" className="header-cell">Perf (arch)</td>
              <td onClick={input.onHeaderClick} id="relativePerfPlayer" className="header-cell">Perf (player)</td>
              <td onClick={input.onHeaderClick} id="playerPerf" className="header-cell">Player perf.</td>
            </tr>
          </thead>
          <tbody>
            {
              cards.map(function(card) {
                if (shouldSkip(card)) {
                  return
                }

                let [relativePerfPlayer, relativePerfArch, expectedRate, pow] = CardAnalyze(
                  card,
                  input.parsed.archetypeData,
                  input.parsed.playerData,
                  input.parsed.filteredDecks,
                )

                // Determine sort value. Default to win percentage.
                let sort = card.win_percent
                switch (input.sortBy) {
                  case "relativePerfArch":
                    sort = relativePerfArch
                    break;
                  case "relativePerfPlayer":
                    sort = relativePerfPlayer
                    break;
                  case "playerPerf":
                    sort = expectedRate
                    break;
                  case "pow":
                    sort = pow
                    break;
                  case "wins":
                    sort = card.win_percent
                    break;
                }

                // Return the row.
                return (
                  <tr sort={sort} className="card" key={card.name}>
                    <td id={card.name} onClick={input.onCardSelected} key="win_percent">{card.win_percent}%</td>
                    <td id={card.name} onClick={input.onCardSelected} key="pow">{pow}%</td>
                    <td id={card.name} onClick={input.onCardSelected} className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                    <td>{relativePerfArch}</td>
                    <td>{relativePerfPlayer}</td>
                    <td>{expectedRate}%</td>
                  </tr>
                )
              }).sort(SortFunc)
            }
          </tbody>
        </table>
      </div>
    );
  }
}

function CardWidgetOptions(input) {
  return (
    <table className="dropdown-header">
      <tbody>
        <tr>
          <td className="selection-cell">
            <DropdownHeader
              label="Stats type"
              options={input.cardWidgetOpts}
              value={input.colorTypeSelection}
              onChange={input.onSelected}
            />
          </td>

          <td className="selection-cell">
            <DropdownHeader
              label="Color"
              options={input.colorWidgetOpts}
              value={input.colorSelection}
              onChange={input.onColorSelected}
            />
          </td>

          <td>
            <NumericInput
              label="Mana value"
              value={input.manaValue}
              onChange={input.onManaValueSelected}
            />
          </td>
        </tr>

        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min #picks"
              value={input.minDrafts}
              onChange={input.onMinDraftsSelected}
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Min #games"
              value={input.minGames}
              onChange={input.onMinGamesSelected}
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Min #players"
              value={input.minPlayers}
              onChange={input.onMinPlayersSelected}
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Max #players"
              value={input.maxPlayers}
              onChange={input.onMaxPlayersSelected}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function UndraftedWidget(input) {
  let draftData = CardData(input.decks, input.minDrafts, input.minGames, input.cube, "")

  // Build a map of all the cards in the cube so we can
  // easily discard cards that have been drafted before.
  let cards = new Map()
  for (var i in input.cube.cards) {
    cards.set(input.cube.cards[i].name, input.cube.cards[i])
  }

  // Discard any cards that have been mainboarded.
  for (let [name, card] of draftData) {
    if (card.mainboard > 0) {
      cards.delete(card.name)
    }
  }

  // All that's left are cards that have never been drafted.
  // Display them in a table. Make them an array first so we can sort.
  let cardArray = []
  let num = 0
  cards.forEach(function(i) {
    cardArray.push(i)
    num += 1
  })
  return (
    <div className="scroll-container-large">
    <table className="widget-table">
      <thead className="table-header">
        <tr>
          <td>{num} cards never mainboarded</td>
        </tr>
      </thead>
      <tbody>
      {
        cardArray.map(function(item) {
         return (
           <tr sort={item.mainboard_percent} className="card" key={item.name}>
             <td><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a></td>
           </tr>
         )
        })
      }
      </tbody>
    </table>
    </div>
  );
}


function CardMainboardTooltipContent(card) {
  let mainboarders = []
  card.players.forEach(function(num, name) {
    mainboarders.push({name: name, num: num})
  })
  let sideboarders = []
  card.sideboarders.forEach(function(num, name) {
    sideboarders.push({name: name, num: num})
  })
  return (
    <div>
      <table>
        <thead className="table-header">
          <tr>
            <td id="name" className="header-cell">Player</td>
            <td id="num" className="header-cell">#</td>
          </tr>
        </thead>
        <tbody>
        {
          mainboarders.map(function(row) {
            return (
              <tr sort={row.num} key={row.name}>
                <td>{row.name}</td>
                <td>{row.num}</td>
              </tr>
            )
          }).sort(SortFunc)
        }
        </tbody>
      </table>
      <table>
        <thead className="table-header">
          <tr>
            <td id="name" className="header-cell">Player</td>
            <td id="num" className="header-cell">#</td>
          </tr>
        </thead>
        <tbody>
        {
          sideboarders.map(function(row) {
            return (
              <tr sort={row.num} key={row.name}>
                <td>{row.name}</td>
                <td>{row.num}</td>
              </tr>
            )
          }).sort(SortFunc)
        }
        </tbody>
      </table>
    </div>
  );
}

function PlayRateChart(input) {
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

  let name = input.selectedCard

  var mb = []
  var sb = []
  var playableSb = []
  for (let bucket of buckets) {
    let stats = bucket.cardData.get(name)
    if (stats != null) {
      mb.push(stats.mainboard_percent)
      sb.push(stats.sideboard_percent)
      playableSb.push(stats.playable_sideboard_percent)
    } else {
      // Player was not in this bucket.
      mb.push(null)
      sb.push(null)
      playableSb.push(null)
    }
  }

  let dataset = [
      {
        label: 'Mainboard %',
        data: mb,
        borderColor: "#0F0",
        backgroundColor: "#0F0",
      },
      {
        label: 'Sideboard %',
        data: sb,
        borderColor: "#FF0",
        backgroundColor: "#FF0",
      },
      {
        label: 'Playable sb %',
        data: playableSb,
        borderColor: "#F00",
        backgroundColor: "#F00",
      },
  ]


  let title = `${name} % (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0, max: 100}},
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
    <div height={chartHeight} width={chartWidth}>
      <Line height={chartHeight} width={chartWidth} options={options} data={data} />
    </div>
  );
}

function ELOChart(input) {
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

  let name = input.selectedCard

  let min = 850
  let max = 1450

  var elo = []
  for (let bucket of buckets) {
    let stats = bucket.cardData.get(name)
    if (stats != null) {
      if (stats.elo > max) {
        max = stats.elo
      }
      if (stats.elo < min) {
        min = stats.elo
      }
      elo.push(stats.elo)
    } else {
      // Player was not in this bucket.
      elo.push(null)
    }
  }

  let dataset = [
      {
        label: 'ELO',
        data: elo,
        borderColor: "#F0F",
        backgroundColor: "#F0F",
      },
  ]


  let title = `${name} ELO (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: min-50, max: max+50}},
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
    <div height={chartHeight} width={chartWidth}>
      <Line height={chartHeight} width={chartWidth} options={options} data={data} />
    </div>
  );
}

function WinrateChart(input) {
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

  let name = input.selectedCard

  var wins = []
  var pows = []
  for (let bucket of buckets) {
    let card = bucket.cardData.get(name)
    if (card != null && card.mainboard_percent > 0) {
      wins.push(card.win_percent)

      // Determine % of wins that involved this card from within this bucket.
      // This is the total number of wins with this card, divided by the total number of
      // wins in the bucket.
      pows.push(100 * card.wins / BucketWins(bucket))
    } else {
      // Card was not in this bucket.
      wins.push(null)
      pows.push(null)
    }
  }

  let dataset = [
      {
        label: 'Win %',
        data: wins,
        borderColor: "#0F0",
        backgroundColor: "#0F0",
      },
      {
        label: '% of all Wins',
        data: pows,
        borderColor: "#FF0",
        backgroundColor: "#FF0",
      },
  ]


  let title = `${name} win % (bucket size = ${input.bucketSize} drafts)`

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {y: {min: 0, max: 100}},
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
    <div height={chartHeight} width={chartWidth}>
      <Line height={chartHeight} width={chartWidth} options={options} data={data} />
    </div>
  );
}

function CardGraph(input) {

  // Determine what to show on each axis.
  let xAxis = input.xAxis
  let yAxis = input.yAxis

  // Split the given decks into fixed-size buckets.
  // Each bucket will contain N drafts worth of deck information.
  let buckets = input.parsed.deckBuckets

  // Labels for each data point.
  var labels = []
  var backgroundColors = []
  var sizes = []

  let name = yAxis + " vs. " + xAxis

  // values is an array of maps with keys 'x' and 'y'.
  var values = []
  for (let [name, card] of input.parsed.cardData) {
    var x = null
    var y = null

    x = getValue(xAxis, card, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)
    y = getValue(yAxis, card, input.parsed.archetypeData, input.parsed.playerData, input.parsed.filteredDecks, input.parsed.pickInfo)

    labels.push(card.name)

    // Default to green, but highlight in red if it is the selected card.
    if (card.name === input.selectedCard) {
      backgroundColors.push("#F00")
      sizes.push(10)
    } else {
      backgroundColors.push("#0F0")
      sizes.push(3)
    }
    values.push({"x": x, "y": y})
  }

  let dataset = [
      {
        label: "All cards",
        data: values,
        pointBackgroundColor: backgroundColors,
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
        title: {display: true, text: yAxis},
        min: getScales(yAxis)[0],
        max: getScales(yAxis)[1],
      },
      x: {
        title: {display: true, text: xAxis},
        min: getScales(xAxis)[0],
        max: getScales(xAxis)[1],
      },
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
    <div>
      <DropdownHeader
        label="X Axis"
        options={CardScatterAxes}
        value={input.xAxis}
        onChange={input.onXAxisSelected}
      />
      <DropdownHeader
        label="Y Axis"
        options={CardScatterAxes}
        value={input.yAxis}
        onChange={input.onYAxisSelected}
      />
      <div height={chartHeight} width={chartWidth}>
        <Scatter height={chartHeight} width={chartWidth} options={options} data={data} />
      </div>
    </div>
  );
}

function getScales(axis) {
switch (axis) {
    case MainboardPercentOption:
    case SideboardPercentOption:
    case WinPercentOption:
    case ExpectedWinPercentOption:
      return [0, 100]
  }
  return [null, null]
}

function getValue(axis, card, archetypeData, playerData, decks, draftData) {
  let [relativePerfPlayer, relativePerfArch, expectedRate, pow] = CardAnalyze(
    card,
    archetypeData,
    playerData,
    decks,
  )

  switch (axis) {
    case NumGamesOption:
      return card.total_games
    case MainboardPercentOption:
      return card.mainboard_percent
    case SideboardPercentOption:
      return card.sideboard_percent
    case ELOOption:
      return card.elo
    case WinPercentOption:
      return card.win_percent
    case PercentOfWinsOption:
      return pow
    case NumDecksOption:
      return card.mainboard
    case NumSideboardOption:
      return card.sideboard
    case ManaValueOption:
      return card.cmc
    case NumPlayersOption:
      return card.players.size
    case ExpectedWinPercentOption:
      return expectedRate
    case DraftOrderOption:
      let pick = draftData.get(card.name)
      return Math.round(pick.pickNumSum / pick.count * 10) / 10
  }
  return null
}
