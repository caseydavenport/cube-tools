// One of the Card explorer's tables: cards with the groups they land in, the
// wires they'd join, and how much they'd add where packages are short.

import React, { useState } from "react"
import { Button } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { CardImagePreview } from "../components/kit/CardImagePreview.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SortHeader } from "../stats/sortHeader.js"
import { compareBy } from "../stats/sortOrder.js"
import { connectionLine, joinOpacity, joinText, partnerText, sortValue, splitJoins, typeText } from "./explorerModel.js"

// PAGE_SIZE is how many rows show at first, and how many more each click adds.
const PAGE_SIZE = 100

// CardCell is the card's name, linked to its page with its image on hover,
// and its type line.
function CardCell({ card, cube }) {
  let name = <CardLink cube={cube} name={card.name} />
  if (card.image) {
    name = (
      <CardImagePreview src={card.image} alt={card.name} width={220}>
        <span><CardLink cube={cube} name={card.name} /></span>
      </CardImagePreview>
    )
  }
  return (
    <td className="ex-card">
      <div className="ex-name">{name}</div>
      <div className="ex-type">{typeText(card)}</div>
    </td>
  )
}

// GroupChips lists the groups the card lands in, each with the condition
// that matched on hover.
function GroupChips({ groups }) {
  return (
    <td className="ex-chips">
      {groups.map(g => (
        <HoverInfo key={g.name} info={g.condition}>
          <span className="kit-chip kit-chip-neutral">{g.name}</span>
        </HoverInfo>
      ))}
    </td>
  )
}

// JoinChip is one wire the card would join, fading as its role gets
// crowded, with what it pairs with on hover.
function JoinChip({ join }) {
  return (
    <HoverInfo title={`Wire ${join.wire}, via ${join.via.join(", ")}`} info={partnerText(join)}>
      <span className="kit-chip kit-chip-package" style={{ opacity: joinOpacity(join.others) }}>{joinText(join)}</span>
    </HoverInfo>
  )
}

// JoinChips lists the wires the card would join through thin roles, thinnest
// first, and folds the crowded ones into one chip that lists them on hover.
function JoinChips({ joins, thin }) {
  const split = splitJoins(joins, thin)
  return (
    <td className="ex-chips ex-joins">
      {split.thin.map(j => <JoinChip key={j.package + j.wire + j.role} join={j} />)}
      {split.crowded.length > 0 && (
        <HoverInfo title="Crowded roles" info={<div>{split.crowded.map(j => <div key={j.package + j.wire + j.role}>{joinText(j)}</div>)}</div>}>
          <span className="kit-chip kit-chip-more">+{split.crowded.length} crowded</span>
        </HoverInfo>
      )}
    </td>
  )
}

// LinkedCell counts the cube cards opposite the card's wires, naming them on
// hover.
function LinkedCell({ card }) {
  let names = card.linked.join(", ")
  if (card.linked_basics) {
    names = ["basic lands", ...card.linked].join(", ")
  }
  if (names === "") {
    return <td className="page-right-cell">0</td>
  }
  return (
    <HoverInfo info={names}>
      <td className="page-right-cell">{card.linked.length}</td>
    </HoverInfo>
  )
}

// ConnectionsCell counts the package pairs the card joins through thin roles,
// listing them on hover.
function ConnectionsCell({ card }) {
  if (card.connections.length === 0) {
    return <td className="page-right-cell">0</td>
  }
  const lines = <div>{card.connections.map(c => <div key={c.a + "|" + c.b}>{connectionLine(c)}</div>)}</div>
  return (
    <HoverInfo info={lines}>
      <td className="page-right-cell">{card.connections.length}</td>
    </HoverInfo>
  )
}

// ExplorerTable shows cards sorted by Fills gaps until a header is clicked,
// PAGE_SIZE rows at a time. thin is the New connections cutoff, for its tip.
export function ExplorerTable({ cards, cube, thin }) {
  const [sort, setSort] = useState({ key: "fills", dir: "desc" })
  const [shown, setShown] = useState(PAGE_SIZE)
  const rows = [...cards].sort(compareBy(card => sortValue(sort.key, card), sort.dir))

  // header is one sortable column head with its tip. A chips column sorts by
  // its count, high to low first, but keeps its head over the chips.
  function header(key, label, tip, chips = false) {
    let className = ""
    if (chips) {
      className = "ex-chips-head"
    }
    return <SortHeader sortKey={key} label={label} tip={tip} sort={sort} setSort={setSort} className={className} />
  }

  return (
    <>
      <div className="stats-table-wrap">
        <table className="widget-table stats-full-width ex-table">
          <thead>
            <tr>
              <SortHeader sortKey="name" label="Card" sort={sort} setSort={setSort} numeric={false} />
              {header("mv", "MV", "Mana value.")}
              {header("groups", "Groups", "Groups in the rules this card lands in. Hover one for the condition it matched.", true)}
              {header("packages", "Packages", "The wires it would join: its role there, and how many cube cards already hold that role.", true)}
              {header("linked", "Linked", "Cube cards it would pair with on the wires it joins.")}
              {header("fills", "Fills gaps", "Each wire it joins adds 1 ÷ (cards already in its role + 1). Thin spots count most.")}
              {header("connections", "New connections", `Package pairs it joins through roles with at most ${thin} other cards, and how many cards they share today.`)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map(card => (
              <tr key={card.name} className="widget-table-row">
                <CardCell card={card} cube={cube} />
                <td className="page-right-cell">{card.cmc}</td>
                <GroupChips groups={card.groups} />
                <JoinChips joins={card.joins} thin={thin} />
                <LinkedCell card={card} />
                <td className="page-right-cell">{card.fills_gaps.toFixed(2)}</td>
                <ConnectionsCell card={card} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <Button size="xs" variant="subtle" mt="xs" onClick={() => setShown(shown + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, rows.length - shown)} more of {rows.length - shown}
        </Button>
      )}
    </>
  )
}
