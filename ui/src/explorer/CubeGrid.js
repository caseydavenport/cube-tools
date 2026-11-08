// The Card explorer's opening view: the cube's own cards as a grid of card
// images to pick from, each with the thinnest roles it holds in the rules.

import React from "react"
import { UnstyledButton } from "@mantine/core"
import { SectionCard } from "../components/kit/SectionCard.js"
import { joinText, splitJoins } from "./explorerModel.js"

// CardTile is one card: its image, name and Fills gaps score, and the two
// thinnest roles it holds. Clicking it searches for the card.
function CardTile({ card, onPick }) {
  const roles = splitJoins(card.joins, Infinity).thin.slice(0, 2)
  return (
    <UnstyledButton className="ex-fit" onClick={() => onPick(card.name)} title={`Search for ${card.name}`}>
      {card.image
        ? <img className="ex-fit-image" src={card.image} alt={card.name} loading="lazy" />
        : <div className="ex-fit-image ex-fit-noimage">{card.name}</div>}
      <div className="ex-fit-name">{card.name}</div>
      <div className="ex-fit-score">Fills gaps {card.fills_gaps.toFixed(2)}</div>
      {roles.map(join => (
        <div key={join.package + join.wire + join.role} className="ex-fit-role">{joinText(join)}</div>
      ))}
    </UnstyledButton>
  )
}

// CubeGrid shows the cube's cards that land in the rules, for a page with no
// search yet, in the page's sort order. total is how many there are; onPick
// gets the clicked card's name.
export function CubeGrid({ cards, total, onPick }) {
  if (cards.length === 0) {
    return <div className="browse-empty">No cube card lands in the rules yet. Search above to explore all cards.</div>
  }
  return (
    <SectionCard title={`Cards in the cube · ${total}`}>
      <p className="ex-note">The cube's cards that land in the rules, the ones holding its thinnest roles first. Pick one to see where it sits, or search above to explore all of Magic.</p>
      <div className="ex-fits">
        {cards.map(card => <CardTile key={card.name} card={card} onPick={onPick} />)}
      </div>
    </SectionCard>
  )
}
