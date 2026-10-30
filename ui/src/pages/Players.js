import React from 'react'
import { ColorImages } from "../utils/Colors.js"
import { bucketXScale } from "../utils/Buckets.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { WinRateCell } from "../components/kit/WinRateCell.js"
import { winRateValue } from "../components/kit/winRate.js"

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
import "../stats/stats.css"
import "./pages.css"

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

// playerSortValue returns the sort key for a player row under the active sort
// column. Pulled out so the table render and arrow-key navigation order the
// roster the same way.
function playerSortValue(row, sortBy) {
  switch (sortBy) {
    case "win_pct":
    case "win_percent": return row.bayesian_win_percent
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
    case "num_decks":
    case "decks": return row.num_decks
    case "trophies": return row.trophies
    case "last_place":
    case "lastplace": return row.last_place
    case "opponent_win_percentage":
    case "opp_%": return row.opponent_win_percentage
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

  const playerEntry = playerData.get(input.player)
  const minGames = 5
  const oppRows = opponentRows(playerEntry, minGames)
  const archRows = breakdownRows(playerEntry.archetype_stats, ["aggro", "control", "midrange"], playerEntry.num_decks)
  const colorRows = breakdownRows(playerEntry.color_stats, ["W", "U", "B", "R", "G"], playerEntry.num_decks)

  return (
    <div className="deck-details">
      {input.header}

      <SectionCard title={input.copy.opponents}>
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              <td onClick={input.onOppHeaderClick} id="name" className="header-cell">{input.copy.details.opponentHeader({ minGames })}</td>
              <HoverInfo title={input.copy.details.opponentWinPctHeader} info={input.copy.details.opponentWinPctTip}>
                <td onClick={input.onOppHeaderClick} id="win_pct" className="header-cell">{input.copy.details.opponentWinPctHeader}</td>
              </HoverInfo>
              <HoverInfo title={input.copy.details.games} info={input.copy.details.gamesTip}>
                <td onClick={input.onOppHeaderClick} id="games" className="header-cell">{input.copy.details.games}</td>
              </HoverInfo>
            </tr>
          </thead>
          <tbody>
            {sortRows(oppRows, input.oppSortBy, input.oppSortInvert).map(opponent => {
              // Opponents who are themselves in the roster link to their page.
              const canLink = input.onSelectPlayer && playerData.has(opponent.name)
              return (
                <tr key={opponent.name} className="widget-table-row">
                  <td className={canLink ? "xlink" : undefined} onClick={canLink ? () => input.onSelectPlayer(opponent.name) : undefined}>{opponent.name}</td>
                  <WinRateCell record={opponent.record} confidence={input.confidence} />
                  <td>{opponent.games}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={input.copy.archetypes}>
        <BreakdownTable rows={archRows} input={input}
          nameHeader={input.copy.details.arch} buildTip={input.copy.details.archBuildPctTip}
          onHeaderClick={input.onPlayerArchHeaderClick} sortBy={input.playerArchSortBy} invert={input.playerArchSortInvert}
          renderName={name => name} />
      </SectionCard>

      <SectionCard title={input.copy.colors}>
        <BreakdownTable rows={colorRows} input={input}
          nameHeader={input.copy.details.color} buildTip={input.copy.details.colorBuildPctTip}
          onHeaderClick={input.onPlayerColorHeaderClick} sortBy={input.playerColorSortBy} invert={input.playerColorSortInvert}
          renderName={name => ColorImages(name)} />
      </SectionCard>

      <SectionCard title={input.copy.winRateOverTime}>
        <WinRateChart dataset="wins" {...input} />
      </SectionCard>

    </div>
  );
}

// WinRateChart plots the player's Bayes win rate in each time bucket the
// server computed. A bucket the player didn't play in leaves a gap.
function WinRateChart(input) {
  const buckets = input.parsed.playerBuckets || []
  const labels = buckets.map(bucket => bucket.start)
  const values = buckets.map(bucket => {
    const stats = bucket.playerData.get(input.player)
    if (stats == null) {
      return null
    }
    return winRateValue(stats)
  })

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
    <div className="players-line-chart">
      <Line height={"300px"} width={"300px"} options={options} data={data} />
    </div>
  );
}

// opponentRows lists the player's record against each named opponent with at
// least minGames games.
function opponentRows(playerEntry, minGames) {
  const rows = []
  for (const [name, record] of playerEntry.opponents || new Map()) {
    const games = record.wins + record.losses + record.draws
    if (games < minGames) {
      continue
    }
    rows.push({ name, record, games })
  }
  return rows
}

// breakdownRows turns a player's per-archetype or per-color records into table
// rows for the given names, in that order, with each one's share of the
// player's decks. A name the player never played shows an empty record.
function breakdownRows(stats, names, totalDecks) {
  return names.map(name => {
    const record = (stats && stats.get(name)) || { wins: 0, losses: 0, draws: 0, count: 0 }
    let buildPercent = 0
    if (totalDecks > 0) {
      buildPercent = Math.round(100 * record.count / totalDecks)
    }
    return { name, record, games: record.wins + record.losses + record.draws, buildPercent }
  })
}

// rowSortValue is what a breakdown or opponent row sorts by for a column id.
// Names sort A to Z; everything else sorts highest first, with the Bayes win
// rate as the default.
function rowSortValue(row, sortBy) {
  switch (sortBy) {
    case "name":
      return row.name
    case "build":
    case "build_pct":
      return row.buildPercent
    case "games":
      return row.games
    case "wins":
      return row.record.wins
    case "losses":
      return row.record.losses
    default: {
      const value = winRateValue(row.record)
      if (value === null) {
        return -1
      }
      return value
    }
  }
}

// sortRows returns the rows ordered by the column id, flipped when invert is set.
function sortRows(rows, sortBy, invert) {
  const sorted = [...rows].sort((a, b) => {
    const av = rowSortValue(a, sortBy)
    const bv = rowSortValue(b, sortBy)
    let cmp
    if (typeof av === "string") {
      cmp = av.localeCompare(bv)
    } else {
      cmp = compareHighestFirst(av, bv)
    }
    if (invert) {
      cmp = -cmp
    }
    return cmp
  })
  return sorted
}

// BreakdownTable is the player's record split by archetype or by color: build
// share, Bayes win rate, wins and losses. renderName draws the first cell.
function BreakdownTable({ rows, input, nameHeader, buildTip, onHeaderClick, sortBy, invert, renderName }) {
  return (
    <table className="widget-table">
      <thead className="table-header">
        <tr>
          <td onClick={onHeaderClick} id="name" className="header-cell">{nameHeader}</td>
          <HoverInfo title={input.copy.details.buildPct} info={buildTip}>
            <td onClick={onHeaderClick} id="build" className="header-cell">{input.copy.details.buildPct}</td>
          </HoverInfo>
          <HoverInfo title={input.copy.details.winPct} info={input.copy.details.winPctTip}>
            <td onClick={onHeaderClick} id="win_pct" className="header-cell">{input.copy.details.winPct}</td>
          </HoverInfo>
          <HoverInfo title={input.copy.details.wins} info={input.copy.details.winsTip}>
            <td onClick={onHeaderClick} id="wins" className="header-cell">{input.copy.details.wins}</td>
          </HoverInfo>
          <HoverInfo title={input.copy.details.losses} info={input.copy.details.lossesTip}>
            <td onClick={onHeaderClick} id="losses" className="header-cell">{input.copy.details.losses}</td>
          </HoverInfo>
        </tr>
      </thead>
      <tbody>
        {sortRows(rows, sortBy, invert).map(row => (
          <tr key={row.name} className="widget-table-row">
            <td>{renderName(row.name)}</td>
            <td>{row.buildPercent}%</td>
            <WinRateCell record={row.record} confidence={input.confidence} />
            <td>{row.record.wins}</td>
            <td>{row.record.losses}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
