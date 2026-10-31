// The package page's sections under the header: its wires, how its groups
// spread over the colors, the decks that built it, and related packages.

import React, { useState } from "react"
import { Link } from "react-router-dom"
import { UnstyledButton } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { DeckRow } from "../cards/CardPlaySections.js"
import { packageMatch, packagePageHref, pageHrefWithMatch } from "../shell/paths.js"
import { ColorImages } from "../utils/Colors.js"
import { colorCell } from "./packagePageModel.js"

// DECKS_SHOWN is how many decks the decks section lists before "Show all".
const DECKS_SHOWN = 10

// GroupChip is one group on a wire: its name and card count, opening to its
// cards and the other packages that use it.
function GroupChip({ group, cube }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="package-group">
      <UnstyledButton className="kit-chip kit-chip-neutral" onClick={() => setOpen(!open)}>
        {group.name} <span className="kit-chip-count">{group.cards.length}</span>
      </UnstyledButton>
      {open && (
        <div className="package-group-cards">
          <div className="kit-chips">
            {group.cards.map(name => <CardLink key={name} cube={cube} name={name} className="kit-chip kit-chip-card" />)}
          </div>
          {group.other_packages.length > 0 && (
            <div className="package-group-also">
              Also in{" "}
              {group.other_packages.map((name, i) => (
                <span key={name}>
                  {i > 0 && ", "}
                  <Link to={packagePageHref(cube, name)}>{name}</Link>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Wires lists each wire as the groups on one side, then the groups on the
// other.
export function Wires({ page, cube }) {
  const title = (
    <HoverInfo title="Wires" info="The groups the rules join. A deck builds the package with 2 or more cards on each side of one wire. Click a group for its cards.">
      <span>Wires</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      {page.wires.map((wire, i) => (
        <div key={i} className="package-wire">
          <div className="package-wire-side">
            {wire.sources.map(g => <GroupChip key={g.name} group={g} cube={cube} />)}
          </div>
          <span className="package-wire-arrow">↔</span>
          <div className="package-wire-side">
            {wire.targets.map(g => <GroupChip key={g.name} group={g} cube={cube} />)}
          </div>
        </div>
      ))}
    </SectionCard>
  )
}

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

// sideLabel names a wire side without direction: the rules file's "source"
// side reads "one side", its "target" side "other side".
function sideLabel(side) {
  if (side === "source") {
    return "one side"
  }
  return "other side"
}

// colorRowClass styles a side's total row apart from the group rows.
function colorRowClass(row) {
  if (row.total) {
    return "widget-table-row package-color-total"
  }
  return "widget-table-row"
}

// ColorSupport is the support-by-color table: each group's cards by color,
// then each side's totals, shaded where one side is thin in a color the other
// side uses.
export function ColorSupport({ page }) {
  if (page.color_table.length === 0) {
    return null
  }
  const title = (
    <HoverInfo title="Support by color" info="Each group's cube cards by color; a gold card counts once per color. On the side totals, a shaded cell has 2 or fewer cards in a color the other side has 3 or more of.">
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
          <tbody>
            {page.color_table.map(row => (
              <tr key={row.side + row.group} className={colorRowClass(row)}>
                <td className="header-cell">
                  {row.group} {!row.total && <span className="stats-muted">{sideLabel(row.side)}</span>}
                </td>
                {COLOR_COLUMNS.map(color => {
                  const cell = colorCell(row, color)
                  let className = "page-right-cell"
                  if (cell.thin) {
                    className += " package-color-thin"
                  }
                  return <td key={color} className={className}>{cell.value}</td>
                })}
              </tr>
            ))}
          </tbody>
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
