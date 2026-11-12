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

// Side lists one side of the wire as chips, under its role, like "Enablers".
function Side({ role, entries }) {
  let chips = <span className="de-muted">No groups</span>
  if (entries.length > 0) {
    chips = entries.map(name => <span key={name} className="kit-chip kit-chip-neutral">{entryLabel(name)}</span>)
  }
  return (
    <span className="wp-side">
      <span className="wp-role">{role}</span>
      {chips}
    </span>
  )
}

// deckLine is one deck in a cell's hover: player, date and record, with a
// check mark when the deck built the wire.
function deckLine(deck) {
  let mark = "  "
  if (deck.built) {
    mark = "✓ "
  }
  return `${mark}${deck.player} · ${deck.date} · ${deck.wins}-${deck.losses}`
}

// cellTitle heads a cell's hover: its decks and how many built the wire.
function cellTitle(count, built) {
  if (built === count) {
    return `${decksText(count)}, all built it`
  }
  if (built === 0) {
    return `${decksText(count)}, none built it`
  }
  return `${decksText(count)}, ${built} built it`
}

// DepthCell is one cell of the grid, shaded by its share of the largest cell,
// listing its decks on hover. a and b are the cell's card counts, and cells
// holding a deck that built the wire are outlined.
function DepthCell({ a, b, count, built, decks, max, color }) {
  if (a === 0 && b === 0) {
    return <td className="wp-cell" />
  }
  let className = "wp-cell"
  if (built > 0) {
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
  return <HoverInfo title={cellTitle(count, built)} info={list}>{cell}</HoverInfo>
}

// sideEntries returns one side's entries: "first" for sources, "second" for
// targets.
function sideEntries(wire, side) {
  if (side === "second") {
    return wire.targets || []
  }
  return wire.sources || []
}

// sideName names one side by all its entries, like "Outlets and Fodder".
function sideName(entries) {
  const names = entries.map(entryLabel)
  if (names.length === 0) {
    return "no groups"
  }
  if (names.length === 1) {
    return names[0]
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

// sideRole is one side's role in a sentence: "enabler" or "payoff" on an
// Enables wire, or the side's groups on a Pairs with wire.
function sideRole(wire, side) {
  if (wireKind(wire) === "enables") {
    return sideLabels("enables")[side].toLowerCase().replace(/s$/, "")
  }
  return sideName(sideEntries(wire, side))
}

// axisLabel names one axis of the depth grid by the cards it counts.
function axisLabel(wire, side) {
  if (wireKind(wire) === "enables") {
    return `${sideLabels("enables")[side]} played`
  }
  return `Cards played from ${sideName(sideEntries(wire, side))}`
}

// needText reads one side's build requirement, like "2 enablers" or "1 card
// from Outlets". A side needing 0 is met only by its basic lands.
function needText(wire, side, need) {
  if (need === 0) {
    return `a basic land from the ${sideRole(wire, side)} side`
  }
  if (wireKind(wire) === "enables") {
    const role = sideRole(wire, side)
    if (need === 1) {
      return `1 ${role}`
    }
    return `${need} ${role}s`
  }
  let cards = "cards"
  if (need === 1) {
    cards = "card"
  }
  return `${need} ${cards} from ${sideRole(wire, side)}`
}

// BuildRule says what a deck needs to build the package through the wire, as
// the server's design.WireCards.BuiltBy decides it.
function BuildRule({ wire }) {
  const first = needText(wire, "first", wire.need_sources)
  const second = needText(wire, "second", wire.need_targets)
  let total = ""
  if (wire.need_sources + wire.need_targets < 3) {
    total = ", with 3 or more of its cards in all"
  }
  return (
    <div className="wp-rule">
      A deck builds this wire when it plays at least {first} and {second}{total}.
      A build-around card can stand in for the rest of its side.
    </div>
  )
}

// ZeroHeader is a grid's 0 row or column heading, with a tip saying what its
// decks are missing.
function ZeroHeader({ wire, side }) {
  const role = axisLabel(wire, side).replace(/ played$/, "").toLowerCase()
  return (
    <HoverInfo info={`Decks here played no ${role}, only cards from the other side.`}>
      <th className="wp-zero">0</th>
    </HoverInfo>
  )
}

// DepthGrid lays out the wire's depth cells: rows count cards from the
// wire's first side, columns from its second.
function DepthGrid({ wire, color }) {
  const depth = wire.depth || []
  if (depth.length === 0) {
    return <div className="de-muted">No deck had any of this wire's cards.</div>
  }
  const matrix = depthMatrix(depth)
  const cellAt = {}
  let max = 1
  for (const cell of depth) {
    cellAt[cell.a + ":" + cell.b] = cell
    max = Math.max(max, cell.count)
  }

  const columnHeads = SIZES.map((label, b) => {
    if (b === 0) {
      return <ZeroHeader key={label} wire={wire} side="second" />
    }
    return <th key={label}>{label}</th>
  })

  const rows = matrix.map((row, a) => {
    let rowHead = <th>{SIZES[a]}</th>
    if (a === 0) {
      rowHead = <ZeroHeader wire={wire} side="first" />
    }
    const cells = row.map((count, b) => {
      const cell = cellAt[a + ":" + b] || { built: 0, decks: [] }
      return <DepthCell key={b} a={a} b={b} count={count} built={cell.built} decks={cell.decks} max={max} color={color} />
    })
    // The row axis label spans every row, so only the first row holds it.
    let rowAxis = null
    if (a === 0) {
      rowAxis = <th rowSpan={SIZES.length} className="wp-axis wp-axis-rows">{axisLabel(wire, "first")} →</th>
    }
    return <tr key={a}>{rowAxis}{rowHead}{cells}</tr>
  })

  return (
    <table className="wp-grid">
      <tbody>
        <tr><th /><th /><th colSpan={SIZES.length} className="wp-axis">{axisLabel(wire, "second")} →</th></tr>
        <tr><th /><th />{columnHeads}</tr>
        {rows}
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
  const roles = sideLabels(wireKind(wire))
  return (
    <Drawer opened onClose={onClose} position="right" size="lg" title={`Wire ${index + 1} · ${kindName(wire)}`}>
      <div className="wp-sides">
        <Side role={roles.first} entries={wire.sources || []} />
        <span className="wp-join">↔</span>
        <Side role={roles.second} entries={wire.targets || []} />
      </div>
      <BuildRule wire={wire} />
      <div className="wp-numbers">
        <b>{decksText(wire.decks)}</b> built it · <b>{wire.typical_pairs}</b> linked pairs in a typical one
      </div>
      <div className="de-subhead">How deep decks went</div>
      <div className="wp-caption">
        Every deck that had any of this wire's cards, placed by how many it ran from each side.
        Outlined cells hold decks that built it; hover a cell to see them.
      </div>
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
