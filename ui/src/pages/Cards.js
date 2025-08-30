import React from 'react'
import { StdDev, IsBasicLand, SortFunc } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { Wins, Losses } from "../utils/Deck.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { CardData, CardAnalyze } from "../utils/Cards.js"
import { BucketName, BucketWins } from "../utils/Buckets.js"

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

// Chart configuration.
const chartHeight = "1000px"
const chartWidth = "300px"
const ticks = {
  color: "#FFF",
  font: {
    size: 16,
  },
}

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
export const NumTrophiesOption = "# Trophies"
export const NumLastPlaceOption = "# Last place"
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
  {label: NumTrophiesOption, value: NumTrophiesOption},
  {label: NumLastPlaceOption, value: NumLastPlaceOption},
]

const Interaction = "All interaction"
const Counterspells = "Counterspells"
const Removal = "Removal"
const Land = "Land"
const Nonland = "Nonland"
const matchOpts = [
  {label: "", value:""},
  {label: Interaction, value: Interaction},
  {label: Counterspells, value: Counterspells},
  {label: Removal, value: Removal},
  {label: Land, value: Land},
  {label: Nonland, value: Nonland},
]

  // shouldSkip returns true if the card should be skipped, and false otherwise.
  function shouldSkip(card, input) {
    if (card.players.size < input.minPlayers) {
      return true
    }
    if (input.maxPlayers != 0 && card.players.size > input.maxPlayers) {
      return true
    }
    if (input.manaValue >=0 && card.cmc != input.manaValue) {
      return true
    }
    switch (input.cardFilter) {
      case Interaction:
        return !card.interaction;
      case Counterspells:
        return !card.counterspell;
      case Removal:
        return !card.removal;
      case Land:
        return !card.land;
      case Nonland:
        return card.land;
    }
    return false
  }


export function CardWidget(input) {
  if (!input.show) {
    return null
  }

  let matchInput = {
    "matchOpts": matchOpts,
  }

  return (
    <div style={{"width": "100%"}}>
      <CardWidgetOptions {...input} {...matchInput} />
      <CardWidgetTable {...input} />
      <WinrateChart {...input} />
      <PlayRateChart {...input} />
      <ELOChart {...input} />
      <CardGraph {...input} />
    </div>
  );
}

function CardWidgetTable(input) {
  // Convert the cardData map to a list for sorting purposes.
  let cards = []
  for (let [name, card] of input.parsed.cardData) {
    cards.push(card)
  }

  let headers = [
    {
      id: "card",
      text: "Card",
      tip: "Card name. Click on the cell to focus the card and display it in graphs."
    },
    {
      id: "mainboarded",
      text: "Deck%",
      tip: "Percentage of drafts this card is included in a mainboard."
    },
    {
      id: "wins",
      text: "Win%",
      tip: "Win percentage of decks that include this card in their mainboard.",
    },
    {
      id: "trophies",
      text: "Trophies",
      tip: "Number of 3-0 decks this card has been in.",
    },
    {
      id: "lastplace",
      text: "Last place",
      tip: "Number of 0-3 decks this card has been in.",
    },
    {
      id: "mb",
      text: "# M",
      tip: "Number of times this card has been mainboarded.",
    },
    {
      id: "sb",
      text: "# S",
      tip: "Number of times this card has been sideboarded.",
    },
    {
      id: "in-color-sb",
      text: "# S (playable)",
      tip: "Number of times this card has been sideboarded but was playable based on the decks color identity.",
    },
    {
      id: "games",
      text: "# Games",
      tip: "Number of games played by decks that included this card.",
    },
    {
      id: "players",
      text: "# Players",
      tip: "Number of unique players who have mainboarded this card.",
    },
    {
      id: "elo",
      text: "ELO",
      tip: "An ELO ranking based on card pick order in packs, with slight weighting.",
    },
    {
      id: "lastPlayed",
      text: "Last played",
      tip: "Date of the draft that this card was last included in a mainboard.",
    },
  ]


  if (input.dropdownSelection === "Mainboard rate") {
    return (
      <div className="scroll-container-large">
        <table className="widget-table">
          <thead className="table-header">
            <tr>
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
                    <td onClick={input.onHeaderClick} id={hdr.id} className="header-cell">{hdr.text}</td>
                  </OverlayTrigger>
                );
              })
            }
            </tr>
          </thead>
          <tbody>
          {
            cards.map(function(card) {
              if (shouldSkip(card, input)) {
                return
              }

              let pd = new Array();
              card.players.forEach(function(num, name) {
                pd.push(num);
              })
              let stddev = StdDev(pd);

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
                case "trophies":
                  sort = card.trophies
                  break
                case "lastplace":
                  sort = card.lastplace
                  break
                case "elo":
                  sort = card.elo
                  break
                case "in-color-sb":
                  sort = card.playableSideboard
                  break
                case "players":
                  sort = card.players.size
                  break
                case "players-stddev":
                  sort = stddev
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
                <tr className="widget-table-row" sort={sort} key={card.name}>
                  <OverlayTrigger
                    placement="right"
                    delay={{ show: 500, hide: 100 }}
                    overlay={
                      <Popover className="wide-pop" id="popover-basic">
                        <Popover.Header as="h3">Played by</Popover.Header>
                        <Popover.Body>
                          {CardMainboardTooltipContent(card)}
                        </Popover.Body>
                      </Popover>
                    }
                  >
                    <td id={card.name} onClick={input.onCardSelected}><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  </OverlayTrigger>

                  <td id={card.name} onClick={input.onCardSelected} key="name">{card.mainboard_percent}%</td>
                  <td id={card.name} onClick={input.onCardSelected} key="win_percent">{card.win_percent}%</td>
                  <td>{card.trophies}</td>
                  <td>{card.lastplace}</td>
                  <td>{card.mainboard}</td>
                  <td>{card.sideboard}</td>
                  <td>{card.playableSideboard}</td>
                  <td>{card.total_games}</td>
                  <td>{card.players.size}</td>
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
      <div className="scroll-container-large">
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
                if (shouldSkip(card, input)) {
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
                  <tr sort={sort} className="widget-table-row" key={card.name}>
                    <td id={card.name} onClick={input.onCardSelected} key="win_percent">{card.win_percent}%</td>
                    <td id={card.name} onClick={input.onCardSelected} key="pow">{pow}%</td>
                    <td id={card.name} onClick={input.onCardSelected}><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
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
    <div className="scroll-container-large-header">
    <table className="scroll-container-large-header">
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

          <td className="selection-cell">
            <DropdownHeader
              label="Match"
              options={input.matchOpts}
              value={input.cardFilter}
              onChange={input.onCardFilterSelected}
            />
          </td>

          <td className="selection-cell">
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
    </div>
  );
}

function CardMainboardTooltipContent(card) {
  let mainboarders = []
  card.players.forEach(function(num, name) {
    mainboarders.push({name: name, mb: num, sb: 0})
  })
  card.sideboarders.forEach(function(num, name) {
    // Check if an entry exists for this name.
    let found = false
    for (let entry of mainboarders) {
      if (name === entry.name) {
        entry.sb = num
        found = true
      }
    }
    if (!found) {
      // Add a new entry.
      mainboarders.push({name: name, mb: 0, sb: num})
    }
  })

  return (
    <table>
      <thead>
        <tr>
          <td id="name">Who</td>
          <td id="num"># mb</td>
          <td id="num"># sb</td>
        </tr>
      </thead>
      <tbody>
      {
        mainboarders.map(function(row) {
          return (
            <tr sort={row.num} key={row.name}>
              <td>{row.name}</td>
              <td>{row.mb}</td>
              <td>{row.sb}</td>
            </tr>
          );
        }).sort(SortFunc)
      }
      </tbody>
    </table>
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
  if (name == "") {
    return
  }

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
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: ticks,
        title: {display: true, text: "Pick %", font: {size: 20, weight: "bold"}, color: "white"},
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}, color: "white"},
        ticks: ticks,
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
    <div align="center">
      <Line className="chart" options={options} data={data} />
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
  if (name == "") {
    return
  }

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
    scales: {
      y: {
        title: {display: true, text: "Pick ELO", font: {size: 20, weight: "bold"}, color: "white"},
        min: min-50,
        max: max+50,
        ticks: ticks,
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}, color: "white"},
        ticks: ticks,
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
    <div className="chart-container" align="center">
      <Line className="chart" options={options} data={data} />
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
  if (name == "") {
    return
  }

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
    scales: {
      y: {
        title: {display: true, text: "Win %", font: {size: 20, weight: "bold"}, color: "white"},
        min: 0,
        max: 100,
        ticks: ticks,
      },
      x: {
        title: {display: true, text: "Dates", font: {size: 20, weight: "bold"}, color: "white"},
        ticks: ticks,
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
    <div className="chart-container" align="center">
      <Line className="chart" options={options} data={data} />
    </div>
  );
}

function CardGraph(input) {

  // Determine what to show on each axis.
  let xAxis = input.xAxis
  let yAxis = input.yAxis

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

    if (shouldSkip(card, input)) {
      continue
    }

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
        title: {display: true, text: yAxis, font: {size: 20, weight: "bold"}, color: "white"},
        min: getScales(yAxis, false)[0],
        max: getScales(yAxis, false)[1],
        ticks: ticks,
      },
      x: {
        title: {display: true, text: xAxis, font: {size: 20, weight: "bold"}, color: "white"},
        min: getScales(xAxis, false)[0],
        max: getScales(xAxis, false)[1],
        ticks: ticks,
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
    <div className="chart-container">
      <table className="dropdown-header" style={{"width": "75%"}} align="center">
        <tbody>
          <tr>
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
          </tr>
        </tbody>
      </table>

      <div align="center">
        <Scatter className="chart" options={options} data={data} />
      </div>
    </div>
  );
}

function getScales(axis, force) {
  if (force) {
    switch (axis) {
      case MainboardPercentOption:
      case SideboardPercentOption:
      case WinPercentOption:
      case ExpectedWinPercentOption:
        return [0, 100]
    }
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
    case NumTrophiesOption:
      return card.trophies
    case NumLastPlaceOption:
      return card.lastplace
    case DraftOrderOption:
      let pick = draftData.get(card.name)
      if (pick == null) {
        return null
      }
      return Math.round(pick.pickNumSum / pick.count * 10) / 10
  }
  return null
}
