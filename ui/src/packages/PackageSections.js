// The package page's sections under the map: how its groups spread over the
// colors, the decks that built it, and related packages.

import React, { useState } from "react"
import { Link } from "react-router-dom"
import { UnstyledButton } from "@mantine/core"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { DeckRow } from "../cards/CardPlaySections.js"
import { packageMatch, packagePageHref, pageHrefWithMatch } from "../shell/paths.js"
import { ColorImages } from "../utils/Colors.js"
import { colorBlocks, colorCell } from "./packagePageModel.js"
import { columnHeadings } from "./packageMapModel.js"

// DECKS_SHOWN is how many decks the decks section lists before "Show all".
const DECKS_SHOWN = 10

// COLOR_COLUMNS are the support table's columns after the group name.
const COLOR_COLUMNS = ["W", "U", "B", "R", "G", "C", "L"]

// ColumnHead is a color column's header: a mana symbol, or a word for
// colorless and lands.
function ColumnHead({ color }) {
  if (color === "C") {
    return <th className="header-cell stats-numeric">Colorless</th>
  }
  if (color === "L") {
    return <th className="header-cell stats-numeric">Lands</th>
  }
  return <th className="header-cell stats-numeric">{ColorImages([color])}</th>
}

// colorRowClass styles a side's total row apart from the group rows.
function colorRowClass(row) {
  if (row.total) {
    return "widget-table-row package-color-total"
  }
  return "widget-table-row"
}

// ColorRow is one support-by-color row: the group, or the side's total, and
// its cards by color, shaded where the server marked a color thin.
function ColorRow({ name, row }) {
  return (
    <tr className={colorRowClass(row)}>
      <td className="header-cell">{name}</td>
      {COLOR_COLUMNS.map(color => {
        const cell = colorCell(row, color)
        let className = "page-right-cell"
        if (cell.thin) {
          className += " package-color-thin"
        }
        return <td key={color} className={className}>{cell.value}</td>
      })}
    </tr>
  )
}

// ColorSupport is the support-by-color table: each group's cards by color in
// two blocks, enablers then payoffs, each ending with its side's total. A
// total is shaded where its side is thin in a color the other side uses.
export function ColorSupport({ page }) {
  if (page.color_table.length === 0) {
    return null
  }
  const enables = columnHeadings(page.map) !== null
  const title = (
    <HoverInfo title="Support by color" info="Each group's cube cards by color; a gold card counts once per color. A shaded total has 2 or fewer cards in a color where the other total has 3 or more.">
      <span>Support by color</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      <div className="stats-table-wrap">
        <table className="widget-table stats-full-width">
          <thead>
            <tr>
              <th className="header-cell">Group</th>
              {COLOR_COLUMNS.map(color => <ColumnHead key={color} color={color} />)}
            </tr>
          </thead>
          {colorBlocks(page.color_table, enables).map(block => (
            <tbody key={block.title}>
              <tr className="package-color-block">
                <td className="header-cell" colSpan={COLOR_COLUMNS.length + 1}>{block.title}</td>
              </tr>
              {block.rows.map(r => <ColorRow key={r.row.group + (r.row.total ? "/total" : "")} name={r.name} row={r.row} />)}
            </tbody>
          ))}
        </table>
      </div>
    </SectionCard>
  )
}

// DecksBuilt lists the decks that built the package in the date range, newest
// first, showing DECKS_SHOWN until expanded.
export function DecksBuilt({ page, nav }) {
  const [expanded, setExpanded] = useState(false)
  if (page.decks.length === 0) {
    return null
  }
  let shown = page.decks
  if (!expanded) {
    shown = page.decks.slice(0, DECKS_SHOWN)
  }

  const match = packageMatch(page.name)
  return (
    <SectionCard
      title="Decks that built it"
      linkLabel="All on the Decks page →"
      href={pageHrefWithMatch(nav.cube, "decks", match, nav.start, nav.end)}
      onLinkClick={() => nav.onMatch(match)}
    >
      {shown.map(deck => <DeckRow key={deck.ref} deck={deck} match={match} nav={nav} />)}
      {!expanded && page.decks.length > DECKS_SHOWN && (
        <UnstyledButton className="card-partner-more" onClick={() => setExpanded(true)}>
          Show all {page.decks.length}
        </UnstyledButton>
      )}
    </SectionCard>
  )
}

// RelatedPackages lists the packages that share a group with this one, each
// linking to its page with the shared groups in a tip.
export function RelatedPackages({ page, cube }) {
  if (page.related.length === 0) {
    return null
  }
  const title = (
    <HoverInfo title="Shares groups with" info="Packages whose wires use one of this package's groups.">
      <span>Shares groups with</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      <div className="kit-chips">
        {page.related.map(r => (
          <HoverInfo key={r.target} info={r.groups.join(", ")}>
            <Link to={packagePageHref(cube, r.target)} className="kit-chip kit-chip-package">{r.target}</Link>
          </HoverInfo>
        ))}
      </div>
    </SectionCard>
  )
}
