import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { Wins, Losses } from "../utils/Deck.js"
import { ApplyTooltip } from "../utils/Tooltip.js"
import { CardData } from "../utils/Cards.js"
import { BucketName } from "../utils/Buckets.js"

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

const chartHeight = "425px"
const chartWidth = "300px"

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
            <ELOChart {...input} />
            <WinrateChart {...input} />
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
      <div className="widget-scroll" style={{"max-height": "1200px"}}>
        <CardWidgetOptions {...input} />
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onHeaderClick} id="mainboarded" className="header-cell">Mainboard %</td>
              <td className="header-cell">Card</td>
              <td onClick={input.onHeaderClick} id="mb" className="header-cell"># mb</td>
              <td onClick={input.onHeaderClick} id="sb" className="header-cell"># sb</td>
              <td onClick={input.onHeaderClick} id="in-color-sb" className="header-cell"># playable sb</td>
              <td onClick={input.onHeaderClick} id="appearances" className="header-cell"># replay</td>
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
              }

              return (
                <tr sort={sort} className="card" key={card.name}>
                  <td id={card.name} onClick={input.onCardSelected} key="name">{card.mainboard_percent}%</td>
                  <td id={card.name} onClick={input.onCardSelected} className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td><ApplyTooltip text={card.mainboard} hidden={CardMainboardTooltipContent(card)}/></td>
                  <td>{card.sideboard}</td>
                  <td>{card.playableSideboard}</td>
                  <td>{card.appearances}</td>
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
      <div className="widget-scroll" style={{"max-height": "1200px"}}>
        <CardWidgetOptions {...input} />
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onHeaderClick} id="wins" className="header-cell">Win rate</td>
              <td onClick={input.onHeaderClick} id="card" className="header-cell">Card</td>
              <td onClick={input.onHeaderClick} id="decks" className="header-cell"># Decks</td>
              <td onClick={input.onHeaderClick} id="games" className="header-cell"># Games</td>
              <td onClick={input.onHeaderClick} id="relativePerfArch" className="header-cell">Perf (arch)</td>
              <td onClick={input.onHeaderClick} id="relativePerfPlayer" className="header-cell">Perf (player)</td>
              <td onClick={input.onHeaderClick} id="playerPerf" className="header-cell">Player perf.</td>
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

                // For each card, determine the weighted average of the archetype win rates for the
                // archetypes that it sees play in. We'll use this to calculate the card's win rate compared
                // to its own archetype win rates.

                // relativePerfArch is the performance of this card relative to the expected performance of
                // all of the archetypes that this card has played in.
                let relativePerfArch = 0

                // Determine the total number of instances of all archetypes this card has to use as the denominator when
                // calculating weighted averages below. The card.archetypes map has keys of the archetype name, and values of
                // the number of times it was seen in a deck of that archetype.
                let totalPicks = 0
                for (let num of card.archetypes.values()) {
                  totalPicks += num
                }

                // For each archetype, use the number of times it shows up for this card, the total number of instances of archetypes
                // this card belongs to, and each archetype's average win rate in order to calculate a weighted average
                // representing the expected win rate of the card.
                let archetypeData = input.parsed.archetypeData
                let weightedBaseRate = 0
                for (let [arch, numArchDecks] of card.archetypes) {
                  let archWinRate = 0

                  if (archetypeData.has(arch)) {
                    archWinRate = archetypeData.get(arch).win_percent
                  }
                  let weight = numArchDecks / totalPicks
                  weightedBaseRate += weight * archWinRate
                }

                if (card.mainboard > 0) {
                  // Assuming this card has been played, calculate the card's win rate vs. the expected win rate based on its archetypes.
                  relativePerfArch = Math.round(card.win_percent / weightedBaseRate * 100) / 100
                }

                // Determine the card's performance compared to the players who have played it.
                // relativePerfPlayer is the performance of this card relative to the expected performance of the card
                // based on the win rate of all the players that have played this card.
                let relativePerfPlayer = 0

                // expectedRate is the expected performance of the card based on the players who have played this card. A higher value means
                // that this card is played on average by players who win more.
                let expectedRate = 0

                let playCount = 0
                for (let [player, count] of card.players) {
                  expectedRate += count * input.parsed.playerData.get(player).winPercent / 100
                  playCount += count
                }
                if (playCount > 0) {
                  expectedRate = Math.round(100 * expectedRate / playCount) / 100
                  relativePerfPlayer = Math.round(card.win_percent / expectedRate) / 100

                  // Convert to a percentage to display in the UI.
                  expectedRate = Math.round(expectedRate * 100)
                }

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
                  case "elo":
                    sort = card.elo
                    break;
                  case "games":
                    sort = card.total_games
                    break
                  case "decks":
                    sort = card.mainboarded
                    break
                  case "lastPlayed":
                    sort = card.lastMainboarded
                    break
                }

                // Return the row.
                return (
                  <tr sort={sort} className="card" key={card.name}>
                    <td id={card.name} onClick={input.onCardSelected} key="name">{card.win_percent}%</td>
                    <td id={card.name} onClick={input.onCardSelected} className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                    <td>{card.mainboard}</td>
                    <td><ApplyTooltip text={card.total_games} hidden={CardMainboardTooltipContent(card)}/></td>
                    <td>{relativePerfArch}</td>
                    <td>{relativePerfPlayer}</td>
                    <td>{expectedRate}%</td>
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
    <div>
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
  for (let bucket of buckets) {
    let card = bucket.cardData.get(name)
    if (card != null && card.mainboard_percent > 0) {
      wins.push(card.win_percent)
    } else {
      // Player was not in this bucket.
      wins.push(null)
    }
  }

  let dataset = [
      {
        label: 'Win %',
        data: wins,
        borderColor: "#0F0",
        backgroundColor: "#0F0",
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
