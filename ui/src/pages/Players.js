import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { ColorImages } from "../utils/Colors.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
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

export function PlayerWidget(input) {
  if (!input.show) {
    return null
  }
  return (
    <table style={{"width": "100%"}}>
      <tbody>
        <tr>
          <td style={{"verticalAlign": "top", "width": "50%"}}>
            <PlayerTable {...input} />
          </td>
          <td style={{"verticalAlign":"top"}}>
            <PlayerDetailsPanel {...input} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function PlayerData(decks) {
  console.time("PlayerData")

  // Go through each deck and build up information about what each player picks.
  let map = new Map()
  for (var i in decks) {
    let deck = decks[i]
    let player = deck.player
    if (!map.has(player)) {
      // Player not seen yet - initialize.
      map.set(player, {
        name: player,
        numDecks: 0,
        decks: new Array(),
        cards: new Map(),
        totalPicks: 0,
        whitePicks: 0,
        bluePicks: 0,
        greenPicks: 0,
        blackPicks: 0,
        redPicks: 0,
        wins: 0,
        losses: 0,
        threeoh: 0,
        ohthree: 0,
      })
    }

    // Add per-deck data here. Like win / loss count.
    map.get(player).wins += Wins(deck)
    map.get(player).losses += Losses(deck)
    map.get(player).numDecks += 1
    map.get(player).decks.push(deck)
    map.get(player).threeoh += Trophies(deck)
    map.get(player).ohthree += LastPlaceFinishes(deck)

    // Go through each card and increase the player's per-card stats.
    for (var j in deck.mainboard) {
      let card = deck.mainboard[j]
      if (IsBasicLand(card)) {
        continue
      }

      // Add this card to the player.
      if (!map.get(player).cards.has(card.name)) {
        map.get(player).cards.set(card.name, {
          name: card.name,
          count: 0
        })
      }
      map.get(player).cards.get(card.name).count += 1
      map.get(player).totalPicks += 1

      // Perform per-color per-card actions.
      for (var c in card.colors) {
        let color = card.colors[c]
        switch(color) {
          case "W":
            map.get(player).whitePicks += 1
            break;
          case "U":
            map.get(player).bluePicks += 1
            break;
          case "B":
            map.get(player).blackPicks += 1
            break;
          case "R":
            map.get(player).redPicks += 1
            break;
          case "G":
            map.get(player).greenPicks += 1
            break;
        }
      }
    }
  }

  // Convert the mapped data into a list of rows to display - one per player.
  for (let row of map.values()) {
    // First, calculate a percentage of this player's total picks for each color.
    row.whitePercent = Math.round(row.whitePicks / row.totalPicks * 100)
    row.bluePercent = Math.round(row.bluePicks / row.totalPicks * 100)
    row.blackPercent = Math.round(row.blackPicks / row.totalPicks * 100)
    row.redPercent = Math.round(row.redPicks / row.totalPicks * 100)
    row.greenPercent = Math.round(row.greenPicks / row.totalPicks * 100)

    // Add in win and loss percentages.
    row.winPercent = Math.round(row.wins / (row.wins + row.losses) * 100)
    row.lossPercent = Math.round(row.losses / (row.wins + row.losses) * 100)
    row.games = row.wins + row.losses

    // Calculate the average re-pick value for this player by summing up the total
    // number of unique cards mainboarded by the player, divided by the total number cards picked. This is
    // a representation of how diverse this player's card selection is. A higher number indicates a propensity
    // to pick unique cards. A value of 1 means they have never picked the same card twice.
    row.uniqueness = Math.round(row.cards.size / row.totalPicks * 100)
  }
  console.timeEnd("PlayerData")
  return map
}

function PlayerTable(input) {
  let data = []
  let maxGames = 0
  for (let row of input.parsed.playerData.values()) {
    if (row.wins + row.losses > maxGames) {
      maxGames = row.wins + row.losses
    }
  }
  for (let row of input.parsed.playerData.values()) {
    // Skip any players with fewer than half the max games over the period. This heuristic filters out
    // players who haven't met an arbitrary minimum game requirement for more table clarity.
    if (row.wins + row.losses < maxGames/3) {
      continue
    }
    data.push(row)
  }

  return (
    <div>
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Player</td>
            <td onClick={input.onHeaderClick} id="decks" className="header-cell">Decks</td>
            <td onClick={input.onHeaderClick} id="games" className="header-cell">Games</td>
            <td onClick={input.onHeaderClick} id="wins" className="header-cell">Won</td>
            <td onClick={input.onHeaderClick} id="losses" className="header-cell">Lost</td>
            <td onClick={input.onHeaderClick} id="trophies" className="header-cell">Trophies</td>
            <td onClick={input.onHeaderClick} id="lastplace" className="header-cell">Last place</td>
            <td onClick={input.onHeaderClick} id="W" className="header-cell">{ColorImages("W")}</td>
            <td onClick={input.onHeaderClick} id="U" className="header-cell">{ColorImages("U")}</td>
            <td onClick={input.onHeaderClick} id="B" className="header-cell">{ColorImages("B")}</td>
            <td onClick={input.onHeaderClick} id="R" className="header-cell">{ColorImages("R")}</td>
            <td onClick={input.onHeaderClick} id="G" className="header-cell">{ColorImages("G")}</td>
            <td onClick={input.onHeaderClick} id="unique" className="header-cell">Uniq</td>
          </tr>
        </thead>
        <tbody>
        {
          data.map(function(row) {
            // Determine sort value for this row.
            let sort = row.name
            switch(input.sortBy) {
              case "wins":
                sort = row.winPercent
                break;
              case "losses":
                sort = row.lossPercent
                break;
              case "games":
                sort = row.games
                break;
              case "W":
                sort = row.whitePercent
                break
              case "U":
                sort = row.bluePercent
                break
              case "B":
                sort = row.blackPercent
                break
              case "R":
                sort = row.redPercent
                break
              case "G":
                sort = row.greenPercent
                break
              case "unique":
                sort = row.uniqueness
                break
              case "decks":
                sort = row.numDecks
                break
              case "trophies":
                sort = row.threeoh;
                break;
              case "lastplace":
                sort = row.ohthree;
                break;
            }
            if (input.invertSort) {
              sort = -1 * sort
            }
            return (
              <tr sort={sort} className="widget-table-row" key={row.name}>
                <td id={row.name} onClick={input.handleRowClick}>{row.name}</td>
                <td>{row.numDecks}</td>
                <td>{row.games}</td>
                <td>{row.winPercent}%</td>
                <td>{row.lossPercent}%</td>
                <td>{row.threeoh}</td>
                <td>{row.ohthree}</td>
                <td>{row.whitePercent}%</td>
                <td>{row.bluePercent}%</td>
                <td>{row.blackPercent}%</td>
                <td>{row.redPercent}%</td>
                <td>{row.greenPercent}%</td>
                <td>{row.uniqueness}%</td>
              </tr>
            )
          }).sort(SortFunc)
        }
        </tbody>
      </table>
    </div>
  );
}

function PlayerDetailsPanel(input) {
  // Iterate the selected players games and build up record
  // against each opponent.
  let decks = []
  for (let deck of input.decks) {
    if (deck.player == input.player) {
      decks.push(deck)
    }
  }

  let newTracker = function(n) {
    let m = new Map()
    m.set("name", n)
    m.set("wins", 0)
    m.set("losses", 0)
    return m
  }

  let recordByOpponent = new Map()
  let recordByColor = new Map()
  for (let deck of decks) {
    if (deck.games != null) {
      // Include per-game stats.
      for (let game of deck.games) {
        if (!recordByOpponent.has(game.opponent)) {
          recordByOpponent.set(game.opponent, {
            "name": game.opponent,
            "wins": 0,
            "losses": 0,
          })
        }
        let r = recordByOpponent.get(game.opponent)
        if (game.opponent == game.winner) {
          r.losses += 1
        } else {
          r.wins += 1
        }
        recordByOpponent.set(game.opponent, r)
      }
    }
  }

  // Add archetype data from the given player's decks.
  if (!input.parsed.playerData.has(input.player)) {
    return null
  }
  let archData = input.parsed.playerData.get(input.player).archetypeData
  let archRows = [newTracker("aggro"), newTracker("control"), newTracker("midrange")]
  for (let a of archRows) {
    let name = a.get("name")
    if (archData.has(name)) {
      a.set("wins", archData.get(name).wins)
      a.set("losses", archData.get(name).losses)
      a.set("count", archData.get(name).count)
    }
  }

  // Add color data.
  let colorData = input.parsed.playerData.get(input.player).colorData
  let colorRows = [newTracker("W"), newTracker("U"), newTracker("B"), newTracker("R"), newTracker("G")]
  for (let c of colorRows) {
    let color = c.get("name")
    if (colorData.has(color)) {
      c.set("wins", colorData.get(color).wins)
      c.set("losses", colorData.get(color).losses)
      c.set("count", colorData.get(color).num_decks)
    }
  }

  let minGames = 5

  let oppRows = Array.from(recordByOpponent.values())
  return (
    <div>
      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td colSpan="3" id="who" className="header-cell">Selected player: {input.player}</td>
          </tr>
          <tr>
            <td id="name" className="header-cell">Opponent (min {minGames} games)</td>
            <td id="num" className="header-cell">Win %</td>
            <td id="games" className="header-cell">Games</td>
          </tr>
        </thead>
        <tbody>
          {
            oppRows.map(function(opponent) {
              // Filter out any opponent that doesn't meet the minimum games requirement.
              if (opponent.wins + opponent.losses < minGames) {
                return
              }
              let win_pct = Math.round(opponent.wins / (opponent.wins + opponent.losses) * 100)
              return (
                <tr key={opponent.name} sort={win_pct} className="widget-table-row">
                  <td key="name">{opponent.name}</td>
                  <td key="win_pct">{win_pct}%</td>
                  <td key="total">{opponent.wins + opponent.losses}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>

      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Arch</td>
            <td onClick={input.onHeaderClick} id="build" className="header-cell">Build %</td>
            <td onClick={input.onHeaderClick} id="win_pct" className="header-cell">Win %</td>
            <td onClick={input.onHeaderClick} id="wins" className="header-cell">Wins</td>
            <td onClick={input.onHeaderClick} id="losses" className="header-cell">Losses</td>
          </tr>
        </thead>
        <tbody>
          {
            archRows.map(function(arch) {
              let wins = arch.get("wins")
              let loss = arch.get("losses")
              let name = arch.get("name")
              let count = arch.get("count")
              let win_pct = 0
              let bld_pct = 0
              if (wins + loss > 0) {
                win_pct = Math.round(100 * wins / (wins + loss))
                bld_pct = Math.round(100 * count / decks.length)
              }
              return (
                <tr key={name} sort={bld_pct} className="widget-table-row">
                  <td key="name">{name}</td>
                  <td key="bld_pct">{bld_pct}%</td>
                  <td key="win_pct">{win_pct}%</td>
                  <td key="wins">{wins}</td>
                  <td key="losses">{loss}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>

      <table className="widget-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Color</td>
            <td onClick={input.onHeaderClick} id="build_pct" className="header-cell">Build %</td>
            <td onClick={input.onHeaderClick} id="win_pct" className="header-cell">Win %</td>
            <td onClick={input.onHeaderClick} id="wins" className="header-cell">Wins</td>
            <td onClick={input.onHeaderClick} id="losses" className="header-cell">Losses</td>
          </tr>
        </thead>
        <tbody>
          {
            colorRows.map(function(arch) {
              let wins = arch.get("wins")
              let loss = arch.get("losses")
              let name = arch.get("name")
              let count = arch.get("count")
              let win_pct = 0
              let bld_pct = 0
              if (wins + loss > 0) {
                win_pct = Math.round(100 * wins / (wins + loss))
                bld_pct = Math.round(100 * count / decks.length)
              }
              return (
                <tr key={name} sort={bld_pct} className="widget-table-row">
                  <td key="name">{ColorImages(name)}</td>
                  <td key="bld_pct">{bld_pct}%</td>
                  <td key="win_pct">{win_pct}%</td>
                  <td key="wins">{wins}</td>
                  <td key="losses">{loss}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>

      <WinRateChart dataset="wins" {...input} />

    </div>
  );
}

function WinRateChart(input) {
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

  var values = []
  for (let bucket of buckets) {
    let stats = bucket.playerData.get(input.player)
    if (stats != null) {
      values.push(stats.winPercent)
    } else {
      // Player was not in this bucket.
      values.push(null)
    }
  }

  let dataset = [
      {
        label: 'Win %',
        data: values,
        borderColor: "#FFF",
        backgroundColor: "#FFF",
      },
  ]


  let title = `Build % (bucket size = ${input.bucketSize} drafts)`
  switch (input.dataset) {
    case "wins":
      title = `Win % (buckets size = ${input.bucketSize} drafts)`
      break
  }

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
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
