import React from 'react'
import { AverageWordCount, IsBasicLand, SortFunc } from "../utils/Utils.js"
import { ColorImages } from "../utils/Colors.js"
import { Trophies, LastPlaceFinishes, Wins, Losses } from "../utils/Deck.js"
import { BucketName, bucketXScale } from "../utils/Buckets.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { isAnonymous, recordsByOpponent } from "../utils/Players.js"

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
import { Line } from 'react-chartjs-2';
import { currentChartTheme } from "../theme/chartTheme.js"

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

export function PlayerData(decks) {

  // Go through each deck and build up information about what each player picks.
  let map = new Map()
  for (var i in decks) {
    let deck = decks[i]

    // Seat labels recur in every draft, so anonymous decks belong to no player.
    if (isAnonymous(deck)) {
      continue
    }
    let player = deck.player
    if (!map.has(player)) {
      // Player not seen yet - initialize.
      map.set(player, {
        id: deck.player_id || 0,
        name: player,
        num_decks: 0,
        decks: new Array(),
        cards: new Map(),
        total_picks: 0,
        white_picks: 0,
        blue_picks: 0,
        green_picks: 0,
        black_picks: 0,
        red_picks: 0,
        wins: 0,
        losses: 0,
        trophies: 0,
        last_place: 0,
        opponent_win_percentage: 0,
        avg_word_count: 0,
        word_count_sum: 0,
        word_count_count: 0,
      })
    }

    // Add per-deck data here. Like win / loss count.
    map.get(player).wins += Wins(deck)
    map.get(player).losses += Losses(deck)
    map.get(player).num_decks += 1
    map.get(player).decks.push(deck)
    map.get(player).trophies += Trophies(deck)
    map.get(player).last_place += LastPlaceFinishes(deck)

    let avgWC = AverageWordCount({deck: deck})
    if (avgWC !== null) {
      map.get(player).word_count_sum += avgWC
      map.get(player).word_count_count += 1
    }

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
      map.get(player).total_picks += 1

      // Perform per-color per-card actions.
      for (var c in card.colors) {
        let color = card.colors[c]
        switch(color) {
          case "W":
            map.get(player).white_picks += 1
            break;
          case "U":
            map.get(player).blue_picks += 1
            break;
          case "B":
            map.get(player).black_picks += 1
            break;
          case "R":
            map.get(player).red_picks += 1
            break;
          case "G":
            map.get(player).green_picks += 1
            break;
        }
      }
    }
  }

  // Convert the mapped data into a list of rows to display - one per player.
  for (let row of map.values()) {
    // First, calculate a percentage of this player's total picks for each color.
    row.white_percent = Math.round(row.white_picks / row.total_picks * 100)
    row.blue_percent = Math.round(row.blue_picks / row.total_picks * 100)
    row.black_percent = Math.round(row.black_picks / row.total_picks * 100)
    row.red_percent = Math.round(row.red_picks / row.total_picks * 100)
    row.green_percent = Math.round(row.green_picks / row.total_picks * 100)

    // Add in win and loss percentages.
    row.win_percent = Math.round(row.wins / (row.wins + row.losses) * 100)
    row.loss_percent = Math.round(row.losses / (row.wins + row.losses) * 100)
    row.games = row.wins + row.losses

    // Take an average of the opponent win percentages this player has faced.
    let total = 0.0
    let count = 0
    for (let d of row.decks) {
      if (d.opponent_win_percentage == 0) {
        continue
      }
      total += d.opponent_win_percentage
      count += 1
    }
    if (count > 0) {
      total /= count
    }
    row.opponent_win_percentage = Math.round(total)

    // Average re-pick rate: unique mainboarded cards over total picks. Higher
    // means more variety across drafts. Undefined for players with fewer than
    // 2 decks - they haven't had a chance to repeat anything, and in a
    // singleton cube the metric would always read 100%.
    if (row.num_decks >= 2 && row.total_picks > 0) {
      row.uniqueness = Math.round(row.cards.size / row.total_picks * 100)
    } else {
      row.uniqueness = null
    }
    if (row.word_count_count > 0) {
      row.avg_word_count = Math.round(row.word_count_sum / row.word_count_count * 100) / 100
    }
  }
  return map
}

// playerSortValue returns the sort key for a player row under the active sort
// column. Pulled out so the table render and arrow-key navigation order the
// roster the same way.
function playerSortValue(row, sortBy) {
  switch (sortBy) {
    case "win_pct":
    case "win_percent": return row.win_percent
    case "loss_percent": return row.loss_percent
    case "games": return row.games
    case "white_percent":
    case "W": return row.white_percent
    case "blue_percent":
    case "U": return row.blue_percent
    case "black_percent":
    case "B": return row.black_percent
    case "red_percent":
    case "R": return row.red_percent
    case "green_percent":
    case "G": return row.green_percent
    case "uniqueness":
    case "unique": return row.uniqueness ?? -1
    case "num_decks":
    case "decks": return row.num_decks
    case "trophies": return row.trophies
    case "last_place":
    case "lastplace": return row.last_place
    case "opponent_win_percentage":
    case "opp_%": return row.opponent_win_percentage
    case "avg_word_count": return row.avg_word_count || 0
    default: return row.name
  }
}

// compareHighestFirst orders two numbers so the larger one comes first.
function compareHighestFirst(a, b) {
  if (a > b) {
    return -1
  }
  if (a < b) {
    return 1
  }
  return 0
}

// playerRowsInOrder returns the roster rows meeting the min-games cutoff, in the
// table's current sort order.
export function playerRowsInOrder(input) {
  let rows = []
  for (let row of input.parsed.playerData.values()) {
    if (row.wins + row.losses < input.minGames) continue
    rows.push(row)
  }
  rows.sort((a, b) => {
    let sa = playerSortValue(a, input.sortBy)
    let sb = playerSortValue(b, input.sortBy)

    // Names sort A to Z; numbers sort highest first.
    let cmp
    if (typeof sa === "string") {
      cmp = sa.localeCompare(sb)
    } else {
      cmp = compareHighestFirst(sa, sb)
    }

    if (input.invertSort) {
      cmp = -cmp
    }
    return cmp
  })
  return rows
}

// PlayerDetailsPanel shows the selected player's records: against each
// opponent, by archetype, by color, and their win rate over time. header is the
// summary card shown above them; copy holds the section titles.
export function PlayerDetailsPanel(input) {
  // Defensive checks for initialization
  if (!input.player || !input.parsed || !input.parsed.playerData) {
    return null;
  }

  // Ensure we have a Map
  const playerData = input.parsed.playerData;
  if (!(playerData instanceof Map) && typeof playerData.has !== 'function') {
    return null;
  }

  if (!playerData.has(input.player)) {
    return null;
  }

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
    m.set("count", 0)
    return m
  }


  // Get the player's total deck count for percentage calculations
  const playerEntry = playerData.get(input.player);
  const totalPlayerDecks = playerEntry.num_decks;

  // Add archetype data from the given player's decks.
  let archData = playerEntry.archetype_stats

  let archRows = [newTracker("aggro"), newTracker("control"), newTracker("midrange")]
  for (let a of archRows) {
    let name = a.get("name")
    // Check for both exact match and lowercase match
    let data = null;
    if (archData && archData.has) {
      if (archData.has(name)) {
        data = archData.get(name);
      } else if (archData.has(name.charAt(0).toUpperCase() + name.slice(1))) {
        data = archData.get(name.charAt(0).toUpperCase() + name.slice(1));
      }
    }

    if (data) {
      a.set("wins", data.wins || 0)
      a.set("losses", data.losses || 0)
      a.set("count", data.count || 0)
    }
  }

  // Add color data.
  let colorData = playerEntry.color_stats
  let colorRows = [newTracker("W"), newTracker("U"), newTracker("B"), newTracker("R"), newTracker("G")]
  for (let c of colorRows) {
    let color = c.get("name")
    if (colorData && colorData.has && colorData.has(color)) {
      const data = colorData.get(color);
      c.set("wins", data.wins || 0)
      c.set("losses", data.losses || 0)
      // Server uses 'count', client-side uses 'num_decks'
      c.set("count", data.count ?? data.num_decks ?? 0)
    }
  }

  let minGames = 5

  let oppRows = recordsByOpponent(decks)

  return (
    <div className="deck-details">
      {input.header}

      <SectionCard title={input.copy.opponents}>
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onOppHeaderClick} id="name" className="header-cell">{input.copy.details.opponentHeader({ minGames })}</td>
              <HoverInfo title={input.copy.details.winPct} info={input.copy.details.opponentWinPctTip}>
                <td onClick={input.onOppHeaderClick} id="win_pct" className="header-cell">{input.copy.details.winPct}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.games} info={input.copy.details.gamesTip}>
                <td onClick={input.onOppHeaderClick} id="games" className="header-cell">{input.copy.details.games}</td>
              </HoverInfo>
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
                let sort = win_pct
                switch (input.oppSortBy) {
                  case "name":
                    sort = opponent.name
                    break;
                  case "win_pct":
                    sort = win_pct
                    break;
                  case "games":
                    sort = opponent.wins + opponent.losses
                    break;
                }
                if (input.oppSortInvert && typeof sort === 'number') {
                  sort = -1 * sort
                }
                // Opponents who are themselves in the roster link to their page.
                const canLink = input.onSelectPlayer && playerData.has(opponent.name)
                return (
                  <tr key={opponent.name} sort={sort} className="widget-table-row">
                    <td key="name" className={canLink ? "xlink" : undefined} onClick={canLink ? () => input.onSelectPlayer(opponent.name) : undefined}>{opponent.name}</td>
                    <td key="win_pct">{win_pct}%</td>
                    <td key="total">{opponent.wins + opponent.losses}</td>
                  </tr>
                )
              }).sort(SortFunc)
            }
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={input.copy.archetypes}>
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onPlayerArchHeaderClick} id="name" className="header-cell">{input.copy.details.arch}</td>
              <HoverInfo title={input.copy.details.buildPct} info={input.copy.details.archBuildPctTip}>
                <td onClick={input.onPlayerArchHeaderClick} id="build" className="header-cell">{input.copy.details.buildPct}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.winPct} info={input.copy.details.winPctTip}>
                <td onClick={input.onPlayerArchHeaderClick} id="win_pct" className="header-cell">{input.copy.details.winPct}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.wins} info={input.copy.details.winsTip}>
                <td onClick={input.onPlayerArchHeaderClick} id="wins" className="header-cell">{input.copy.details.wins}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.losses} info={input.copy.details.lossesTip}>
                <td onClick={input.onPlayerArchHeaderClick} id="losses" className="header-cell">{input.copy.details.losses}</td>
              </HoverInfo>
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
                }
                if (totalPlayerDecks > 0) {
                  bld_pct = Math.round(100 * count / totalPlayerDecks)
                }

                let sort = bld_pct
                switch (input.playerArchSortBy) {
                  case "name":
                    sort = name;
                    break;
                  case "build":
                    sort = bld_pct;
                    break;
                  case "win_pct":
                    sort = win_pct;
                    break;
                  case "wins":
                    sort = wins;
                    break;
                  case "losses":
                    sort = loss;
                    break;
                }
                if (input.playerArchSortInvert && typeof sort === 'number') {
                  sort = -1 * sort
                }

                return (
                  <tr key={name} sort={sort} className="widget-table-row">
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
      </SectionCard>

      <SectionCard title={input.copy.colors}>
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onPlayerColorHeaderClick} id="name" className="header-cell">{input.copy.details.color}</td>
              <HoverInfo title={input.copy.details.buildPct} info={input.copy.details.colorBuildPctTip}>
                <td onClick={input.onPlayerColorHeaderClick} id="build_pct" className="header-cell">{input.copy.details.buildPct}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.winPct} info={input.copy.details.winPctTip}>
                <td onClick={input.onPlayerColorHeaderClick} id="win_pct" className="header-cell">{input.copy.details.winPct}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.wins} info={input.copy.details.winsTip}>
                <td onClick={input.onPlayerColorHeaderClick} id="wins" className="header-cell">{input.copy.details.wins}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.losses} info={input.copy.details.lossesTip}>
                <td onClick={input.onPlayerColorHeaderClick} id="losses" className="header-cell">{input.copy.details.losses}</td>
              </HoverInfo>
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
                }
                if (totalPlayerDecks > 0) {
                  bld_pct = Math.round(100 * count / totalPlayerDecks)
                }

                let sort = bld_pct
                switch (input.playerColorSortBy) {
                  case "name":
                    sort = name;
                    break;
                  case "build_pct":
                    sort = bld_pct;
                    break;
                  case "win_pct":
                    sort = win_pct;
                    break;
                  case "wins":
                    sort = wins;
                    break;
                  case "losses":
                    sort = loss;
                    break;
                }
                if (input.playerColorSortInvert && typeof sort === 'number') {
                  sort = -1 * sort
                }

                return (
                  <tr key={name} sort={sort} className="widget-table-row">
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
      </SectionCard>

      <SectionCard title={input.copy.winRateOverTime}>
        <WinRateChart dataset="wins" {...input} />
      </SectionCard>

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
      values.push(stats.win_percent)
    } else {
      // Player was not in this bucket.
      values.push(null)
    }
  }

  let dataset = [
      {
        label: input.copy.details.winPct,
        data: values,
        borderColor: () => currentChartTheme().text,
        backgroundColor: () => currentChartTheme().text,
      },
  ]


  let title = input.copy.details.buildTitle({ bucketSize: input.bucketSize })
  switch (input.dataset) {
    case "wins":
      title = input.copy.details.winTitle({ bucketSize: input.bucketSize })
      break
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {x: bucketXScale, y: {min: 0, max: 100}},
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
    <div style={{"height":"500px", "width":"100%"}}>
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}
