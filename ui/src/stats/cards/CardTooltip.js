// The hover card on a Cards table row: how often the card made the
// mainboard, and which archetypes played it.

import React from 'react'
import { CardImageURL } from "../../utils/Utils.js"
import { hasData } from "../../utils/dataKinds.js"
import { HoverTable } from "../../components/kit/HoverTable.js"
import { CARDS_COPY } from "./copy.js"

// CardPopBody lays a card popover out as the card image on the left and
// whatever tables are passed as children beside it. The Cards table and the
// Pick order table both use it.
export function CardPopBody({ card, children }) {
  return (
    <div className="stats-card-pop">
      <img className="kit-card-image stats-card-pop-image" src={CardImageURL(card)} alt={card.name} />
      {children}
    </div>
  )
}

// playerRows lists each player who mainboarded or sideboarded the card, with
// their counts of each, mainboarders first and then sideboard-only players.
function playerRows(card) {
  const rows = []
  for (const [name, num] of Object.entries(card.players)) {
    rows.push({ name: name, mb: num, sb: 0 })
  }

  for (const [name, num] of Object.entries(card.sideboarders)) {
    const existing = rows.find(row => row.name === name)
    if (existing) {
      existing.sb = num
    } else {
      rows.push({ name: name, mb: 0, sb: num })
    }
  }
  return rows
}

// CardMainboardTooltipContent is the card name popover: the card image, a
// table of the players who mainboarded or sideboarded it, and its archetype
// counts. The sideboard column only shows for cubes that record sideboards.
export function CardMainboardTooltipContent({ card, info }) {
  const columns = [
    { key: "name", label: CARDS_COPY.tooltip.player },
    { key: "mb", label: CARDS_COPY.tooltip.mainboardCount, align: "center" },
  ]
  // The sideboard column needs sideboards, which some cubes don't record.
  if (hasData(info, "sideboards")) {
    columns.push({ key: "sb", label: CARDS_COPY.tooltip.sideboardCount, align: "center" })
  }

  return (
    <CardPopBody card={card}>
      <HoverTable columns={columns} rows={playerRows(card)} />
      <ArchetypeCounts card={card} info={info} />
    </CardPopBody>
  )
}

// ArchetypeCounts is the name popover's table of the archetype tags on decks
// that mainboarded the card, most common first. Cubes without archetype labels
// don't show it.
function ArchetypeCounts({ card, info }) {
  if (!hasData(info, "archetypes")) {
    return null
  }

  const rows = Object.entries(card.archetypes || {})
    .map(([name, num]) => ({ name: name, num: num }))
    .sort((a, b) => b.num - a.num)
  const columns = [
    { key: "name", label: CARDS_COPY.tooltip.archetype },
    { key: "num", label: CARDS_COPY.tooltip.mainboardCount, align: "center" },
  ]
  return <HoverTable columns={columns} rows={rows} />
}
