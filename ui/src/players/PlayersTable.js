// The Players page's table: one row per player, sorted by matches played by
// default, showing what each tends to draft. Clicking a row expands it into
// that player's profile.

import React from "react"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { WinRateCell } from "../components/kit/WinRateCell.js"
import { ColorImages } from "../utils/Colors.js"
import { archetypeLabel } from "../decks/deckModel.js"
import "../stats/stats.css"

// COLUMNS are the table's headers. id names the sort a header click picks;
// a column without one doesn't sort. tip explains the column on hover.
const COLUMNS = [
  { id: "name", text: "Player" },
  { id: "matches", text: "Matches", tip: "Matches with a recorded result, draws included." },
  { id: "num_decks", text: "Drafts", tip: "Decks the player played in the date range." },
  { text: "Colors", tip: "Colors with at least a fifth of the player's colored mainboard cards." },
  { text: "Leans", tip: "The archetype the player drafted most." },
  { text: "Top package", tip: "The package the player's decks built most often." },
  { text: "Signature card", tip: "A card the player mainboards far more often than everyone else, more than chance would explain. Expand the row for the rest." },
  { id: "win_percent", text: "Win %", tip: "Share of games won, pulled toward 50% for players with few games. Hover a cell for the raw rate and its interval." },
  { id: "trophies", text: "Trophies", tip: "Decks that won every match, at least three, with no draws." },
  { id: "last_place", text: "Last place", tip: "Decks that lost three or more matches without a win." },
  { id: "opponent_win_percentage", text: "Opponent strength", tip: "How well the player's opponents did in their other games: how tough their pairings were." },
]

// sortArrow marks the sorted column's header with its direction.
function sortArrow(column, sortBy, invert) {
  const active = sortBy || "matches"
  if (column.id !== active) {
    return ""
  }
  if (invert) {
    return " ▲"
  }
  return " ▼"
}

// HeaderCell is one column header: clickable when the column sorts, with its
// tip on hover.
function HeaderCell({ column, sortBy, invert, onSort }) {
  let onClick = undefined
  let className = "header-cell"
  if (column.id) {
    onClick = () => onSort(column.id)
    className = "header-cell header-sortable"
  }
  const cell = (
    <td className={className} onClick={onClick}>
      {column.text}{sortArrow(column, sortBy, invert)}
    </td>
  )
  if (!column.tip) {
    return cell
  }
  return <HoverInfo title={column.text} info={column.tip}>{cell}</HoverInfo>
}

// CountCell shows a named count's name, with "Aggro in 4 of 8 decks" style
// detail on hover, or a dash when there's none.
function CountCell({ entry, label, numDecks }) {
  if (!entry) {
    return <td className="players-muted">–</td>
  }
  return (
    <HoverInfo title={label} info={`${label} in ${entry.count} of ${numDecks} decks`}>
      <td>{label}</td>
    </HoverInfo>
  )
}

// PlayerRow is one player's row. onToggle expands or collapses it.
function PlayerRow({ row, confidence, expanded, onToggle }) {
  const t = row.tendencies || {}
  const topArchetype = (t.archetypes || [])[0]
  const topPackage = (t.packages || [])[0]
  const signature = (t.signature_cards || [])[0]

  let archetypeName = ""
  if (topArchetype) {
    archetypeName = archetypeLabel({ macro_archetype: topArchetype.name }) || topArchetype.name
  }
  let packageName = ""
  if (topPackage) {
    packageName = topPackage.name
  }

  let className = "widget-table-row players-row"
  if (expanded) {
    className += " players-row-open"
  }

  return (
    <tr className={className} onClick={() => onToggle(row.name)} aria-expanded={expanded}>
      <td className="players-name">{row.name}</td>
      <td>{t.matches || 0}</td>
      <td>{row.num_decks}</td>
      <td className="players-colors">{ColorImages(t.main_colors || [])}</td>
      <CountCell entry={topArchetype} label={archetypeName} numDecks={row.num_decks} />
      <CountCell entry={topPackage} label={packageName} numDecks={row.num_decks} />
      <td>{signature ? signature.name : <span className="players-muted">–</span>}</td>
      <WinRateCell record={row} confidence={confidence} />
      <td>{row.trophies}</td>
      <td>{row.last_place}</td>
      <td>{Math.round(row.opponent_win_percentage)}%</td>
    </tr>
  )
}

// PlayersTable lists the players in the given order. sortBy and invert mark
// the sorted column; onSort(id) asks for a column. expandedName is the open
// row; renderProfile(row) draws its profile in a full-width row under it.
export function PlayersTable({ rows, sortBy, invert, onSort, confidence, expandedName, onToggle, renderProfile }) {
  return (
    <div className="table-scroll">
      <table className="widget-table players-table">
        <thead className="table-header">
          <tr>
            {COLUMNS.map(column => (
              <HeaderCell key={column.text} column={column} sortBy={sortBy} invert={invert} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const expanded = row.name === expandedName
            return (
              <React.Fragment key={row.name}>
                <PlayerRow row={row} confidence={confidence} expanded={expanded} onToggle={onToggle} />
                {expanded && renderProfile && (
                  <tr className="players-profile-row">
                    <td colSpan={COLUMNS.length}>{renderProfile(row)}</td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
