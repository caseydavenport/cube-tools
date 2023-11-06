import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { Wins, Losses } from "../utils/Deck.js"

export function PlayerWidget(input) {
  if (!input.show) {
    return null
  }
  return (
    <table style={{"width": "100%"}}>
      <tr>
        <td style={{"vertical-align": "top", "width": "50%"}}>
          <PlayerTable {...input} />
        </td>
        <td style={{"vertical-align":"top"}}>
          <PlayerDetailsPanel {...input} />
        </td>
      </tr>
    </table>
  );
}

function PlayerTable(input) {

  // Go through each deck and build up information about what each player picks.
  let map = new Map()
  for (var i in input.decks) {
    let deck = input.decks[i]
    let player = deck.player
    if (!map.has(player)) {
      // Player not seen yet - initialize.
      map.set(player, {
        name: player,
        numDecks: 0,
        cards: new Map(),
        totalPicks: 0,
        whitePicks: 0,
        bluePicks: 0,
        greenPicks: 0,
        blackPicks: 0,
        redPicks: 0,
        wins: 0,
        losses: 0,
      })
    }

    // Add per-deck data here. Like win / loss count.
    map.get(player).wins += Wins(deck)
    map.get(player).losses += Losses(deck)
    map.get(player).numDecks += 1

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
  let data = []
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

    data.push(row)
  }

  return (
    <div>
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Player</td>
            <td onClick={input.onHeaderClick} id="decks" className="header-cell"># Decks</td>
            <td onClick={input.onHeaderClick} id="games" className="header-cell"># Games</td>
            <td onClick={input.onHeaderClick} id="wins" className="header-cell">Wins (%)</td>
            <td onClick={input.onHeaderClick} id="losses" className="header-cell">Losses (%)</td>
            <td onClick={input.onHeaderClick} id="W" className="header-cell">White (%)</td>
            <td onClick={input.onHeaderClick} id="U" className="header-cell">Blue (%)</td>
            <td onClick={input.onHeaderClick} id="B" className="header-cell">Black (%)</td>
            <td onClick={input.onHeaderClick} id="R" className="header-cell">Red (%)</td>
            <td onClick={input.onHeaderClick} id="G" className="header-cell">Green (%)</td>
            <td onClick={input.onHeaderClick} id="unique" className="header-cell">Uniqueness (%)</td>
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
            }
            if (input.invertSort) {
              sort = -1 * sort
            }
            return (
              <tr sort={sort} className="card" key={row.name}>
                <td id={row.name} onClick={input.handleRowClick}>{row.name}</td>
                <td>{row.numDecks}</td>
                <td>{row.games}</td>
                <td>{row.winPercent}%</td>
                <td>{row.lossPercent}%</td>
                <td>{row.whitePercent}%</td>
                <td>{row.bluePercent}%</td>
                <td>{row.blackPercent}%</td>
                <td>{row.redPercent}%</td>
                <td>{row.greenPercent}%</td>
                <td>{row.cards.size} / {row.totalPicks} ({row.uniqueness}%)</td>
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

  let recordByOpponent = new Map()
  for (let deck of decks) {
    if (deck.games == null) {
      continue
    }
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

  let data = Array.from(recordByOpponent.values())
  return (
    <div>
      <table className="winrate-table">
        <thead className="table-header">
          <tr>
            <td onClick={input.onHeaderClick} id="name" className="header-cell">Opponent</td>
            <td onClick={input.onHeaderClick} id="num" className="header-cell">Win %</td>
            <td onClick={input.onHeaderClick} id="num" className="header-cell">Games</td>
          </tr>
        </thead>
        <tbody>
          {
            data.map(function(opponent) {
              // Filter out any opponent that doesn't meet the minimum games requirement.
              if (opponent.wins + opponent.losses < 10) {
                return
              }
              let win_pct = Math.round(opponent.wins / (opponent.wins + opponent.losses) * 100)
              return (
                <tr key={opponent.name} sort={win_pct} className="winrate-row">
                  <td key="name">{opponent.name}</td>
                  <td key="num">{win_pct}</td>
                  <td key="num">{opponent.wins + opponent.losses}</td>
                </tr>
              )
            }).sort(SortFunc)
          }
        </tbody>
      </table>
    </div>
  );
}

