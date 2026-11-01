// The side panel for one wire on the package page: its two sides, how many
// decks filled it, and its depth grid of how far decks went into each side.

import React from "react"
import { Button, Drawer } from "@mantine/core"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { entryLabel } from "../design/rules/boardModel.js"
import { decksText, depthMatrix } from "./packageMapModel.js"
import { sideLabels, wireKind } from "../utils/DesignRules.js"

// SIZES are the depth grid's row and column labels, 5 meaning 5 or more.
const SIZES = ["0", "1", "2", "3", "4", "5+"]

// Side lists one side of the wire as chips.
function Side({ entries }) {
  if (entries.length === 0) {
    return <span className="de-muted">No groups</span>
  }
  return (
    <span className="wp-side">
      {entries.map(name => <span key={name} className="kit-chip kit-chip-neutral">{entryLabel(name)}</span>)}
    </span>
  )
}

// deckLine is one deck in a cell's hover: player, date and record.
function deckLine(deck) {
  return `${deck.player} · ${deck.date} · ${deck.wins}-${deck.losses}`
}

// DepthCell is one cell of the grid, shaded by its share of the largest cell,
// listing its decks on hover. a and b are the cell's card counts.
function DepthCell({ a, b, count, decks, max, color }) {
  if (a === 0 && b === 0) {
    return <td className="wp-cell" />
  }
  let className = "wp-cell"
  if (a >= 2 && b >= 2) {
    className += " wp-cell-built"
  }
  const style = {}
  if (count > 0) {
    style.background = `color-mix(in srgb, ${color} ${Math.round(15 + 60 * count / max)}%, transparent)`
  }
  const cell = <td className={className} style={style}>{count || ""}</td>
  if (count === 0) {
    return cell
  }
  const list = <div className="wp-decks">{decks.map(deck => <div key={deck.ref || deckLine(deck)}>{deckLine(deck)}</div>)}</div>
  return <HoverInfo title={decksText(count)} info={list}>{cell}</HoverInfo>
}

// sideName names one side of the wire for the grid's axes: its one entry, or
// its first entry and how many more.
function sideName(entries) {
  if (entries.length === 0) {
    return "no groups"
  }
  if (entries.length === 1) {
    return entryLabel(entries[0])
  }
  return `${entryLabel(entries[0])} +${entries.length - 1}`
}

// axisLabel names one axis of the depth grid: the side's role and name on
// an Enables wire ("Enablers: Fetches basics"), or "Cards from" its name on a
// Pairs with wire. side is "first" for sources or "second" for targets.
function axisLabel(wire, side) {
  let entries = wire.sources || []
  if (side === "second") {
    entries = wire.targets || []
  }
  if (wireKind(wire) === "enables") {
    return `${sideLabels("enables")[side]}: ${sideName(entries)}`
  }
  return `Cards from ${sideName(entries)}`
}

// DepthGrid lays out the wire's depth cells: rows count cards from the
// wire's first side, columns from its second.
function DepthGrid({ wire, color }) {
  const depth = wire.depth || []
  if (depth.length === 0) {
    return <div className="de-muted">No decks played this wire.</div>
  }
  const matrix = depthMatrix(depth)
  const decksAt = {}
  let max = 1
  for (const cell of depth) {
    decksAt[cell.a + ":" + cell.b] = cell.decks
    max = Math.max(max, cell.count)
  }
  return (
    <table className="wp-grid">
      <tbody>
        <tr><th /><th colSpan={SIZES.length} className="wp-axis">{axisLabel(wire, "second")} →</th></tr>
        <tr><th className="wp-axis">{axisLabel(wire, "first")} ↓</th>{SIZES.map(s => <th key={s}>{s}</th>)}</tr>
        {matrix.map((row, a) => (
          <tr key={a}>
            <th>{SIZES[a]}</th>
            {row.map((count, b) => (
              <DepthCell key={b} a={a} b={b} count={count} decks={decksAt[a + ":" + b] || []} max={max} color={color} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// kindName is how the panel's title names the wire's kind.
function kindName(wire) {
  if (wireKind(wire) === "enables") {
    return "Enables"
  }
  return "Pairs with"
}

// WirePanel shows wire number index + 1. color is the package's color.
// onEdit and onRemove are only offered when canEdit is true.
export function WirePanel({ wire, index, color, canEdit, onClose, onEdit, onRemove }) {
  return (
    <Drawer opened onClose={onClose} position="right" size="lg" title={`Wire ${index + 1} · ${kindName(wire)}`}>
      <div className="wp-sides">
        <Side entries={wire.sources || []} />
        <span className="wp-join">↔</span>
        <Side entries={wire.targets || []} />
      </div>
      <div className="wp-numbers">
        <b>{decksText(wire.decks)}</b> filled it · <b>{wire.typical_pairs}</b> linked pairs in a typical one
      </div>
      <div className="de-subhead">How deep decks went</div>
      <DepthGrid wire={wire} color={color} />
      {canEdit && (
        <div className="wp-actions">
          <Button size="xs" variant="default" onClick={onEdit}>Edit wire</Button>
          <Button size="xs" color="red" variant="light" onClick={onRemove}>Remove wire</Button>
        </div>
      )}
    </Drawer>
  )
}
