// One of the Card explorer's tables: cards with the groups they land in, the
// wires they'd join, and how much they'd add where packages are short. The
// server sorts the rows and sends the first batch; Show more asks for more.

import React from "react"
import { Button } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { CardImagePreview } from "../components/kit/CardImagePreview.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SortHeader } from "../stats/sortHeader.js"
import { entryLabel } from "../design/rules/boardModel.js"
import { connectionLine, joinOpacity, joinText, linkedCount, partnerText, splitJoins, typeText } from "./explorerModel.js"

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
    <HoverInfo title={`Wire ${join.wire}, via ${join.via.map(entryLabel).join(", ")}`} info={partnerText(join)}>
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

// LinkedCell counts what the card would pair with on its wires, basic lands
// included, naming them on hover.
function LinkedCell({ card }) {
  let names = card.linked
  if (card.linked_basics) {
    names = ["basic lands", ...card.linked]
  }
  if (names.length === 0) {
    return <td className="page-right-cell">0</td>
  }
  return (
    <HoverInfo info={names.join(", ")}>
      <td className="page-right-cell">{linkedCount(card)}</td>
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

// ExplorerTable shows the cards the server sent, in its order. total is how
// many match in all, sort the order with setSort to change it, onMore asks
// for more rows, and thin is the New connections cutoff, for its tip.
export function ExplorerTable({ cards, total, cube, thin, sort, setSort, onMore }) {
  // header is one sortable column head with its tip. A chips column sorts by
  // its count, high to low first, but keeps its head over the chips.
  function header(key, label, tip, chips = false) {
    let className = ""
    if (chips) {
      className = "ex-chips-head"
    }
    return <SortHeader sortKey={key} label={label} tip={tip} sort={sort} setSort={setSort} className={className} />
  }

  const hidden = total - cards.length
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
              {header("linked", "Linked", "Cube cards it would pair with on the wires it joins, with basic lands counted as one.")}
              {header("fills", "Uniqueness", "Roughly, how many of its roles few or no other cube cards fill. A role it holds alone counts 1; one shared with one other card counts ½.")}
              {header("connections", "New connections", `Package pairs it joins through roles with at most ${thin} other cards, and how many cards they share today.`)}
            </tr>
          </thead>
          <tbody>
            {cards.map(card => (
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
      {hidden > 0 && (
        <Button size="xs" variant="subtle" mt="xs" onClick={onMore}>
          Show {Math.min(PAGE_SIZE, hidden)} more of {hidden}
        </Button>
      )}
    </>
  )
}

// PAGE_SIZE is how many rows show at first, and how many more each Show more
// adds.
export const PAGE_SIZE = 100
