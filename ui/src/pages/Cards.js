import React from 'react'
import { IsBasicLand, SortFunc } from "../utils/Utils.js"
import { DropdownHeader, NumericInput, Checkbox, DateSelector } from "../components/Dropdown.js"
import { Wins, Losses } from "../utils/Deck.js"
import { ApplyTooltip } from "../utils/Tooltip.js"

export function CardWidget(input) {
  if (!input.show) {
    return null
  }

  // shouldSkip returns true if the card should be skipped, and false otherwise.
  function shouldSkip(card) {
    if (card.players.size < input.minPlayers) {
      return true
    }
    if (input.maxPlayers != 0 && card.players.size > input.maxPlayers) {
      return true
    }
    return false
  }

  if (input.dropdownSelection === "Mainboard rate") {
    return (
      <div className="widget">
        <CardWidgetOptions {...input} />
        <table className="winrate-table">
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
            input.parsed.cardData.map(function(card) {
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
                  sort = card.inColorSideboard
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
                  <td>{card.mainboard_percent}%</td>
                  <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
                  <td><ApplyTooltip text={card.mainboard} hidden={CardMainboardTooltipContent(card)}/></td>
                  <td>{card.sideboard}</td>
                  <td>{card.inColorSideboard}</td>
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
      <div className="widget">
        <CardWidgetOptions {...input} />
        <table className="winrate-table">
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
              input.parsed.cardData.map(function(card) {
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
                    <td>{card.win_percent}%</td>
                    <td className="card"><a href={card.url} target="_blank" rel="noopener noreferrer">{card.name}</a></td>
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
              className="dropdown-header-side-by-side"
            />
          </td>

          <td className="selection-cell">
            <DropdownHeader
              label="Color"
              options={input.colorWidgetOpts}
              value={input.colorSelection}
              onChange={input.onColorSelected}
              className="dropdown-header-side-by-side"
            />
          </td>
        </tr>

        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min #picks"
              value={input.minDrafts}
              onChange={input.onMinDraftsSelected}
              className="dropdown-header-side-by-side"
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Min #games"
              value={input.minGames}
              onChange={input.onMinGamesSelected}
              className="dropdown-header-side-by-side"
            />
          </td>
        </tr>

        <tr>
          <td className="selection-cell">
            <NumericInput
              label="Min #players"
              value={input.minPlayers}
              onChange={input.onMinPlayersSelected}
              className="dropdown-header-side-by-side"
            />
          </td>

          <td className="selection-cell">
            <NumericInput
              label="Max #players"
              value={input.maxPlayers}
              onChange={input.onMaxPlayersSelected}
              className="dropdown-header-side-by-side"
            />
          </td>
        </tr>
      </tbody>
    </table>
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
  )
}
