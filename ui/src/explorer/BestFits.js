// The Card explorer's opening view: the cards from all of Magic that would
// fill this cube's thinnest roles, as a grid of card images to pick from.

import React from "react"
import { UnstyledButton } from "@mantine/core"
import { SectionCard } from "../components/kit/SectionCard.js"
import { joinText, splitJoins } from "./explorerModel.js"

// BEST_FITS is how many cards the grid shows.
const BEST_FITS = 24

// FitTile is one card: its image, name and Fills gaps score, and the two
// thinnest roles it would fill. Clicking it searches for the card.
function FitTile({ card, onPick }) {
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

// BestFits shows the top candidates by Fills gaps, for a page with no
// search yet. onPick gets the clicked card's name.
export function BestFits({ cards, onPick }) {
  if (cards.length === 0) {
    return <div className="browse-empty">No card outside the cube lands in the rules yet.</div>
  }
  return (
    <SectionCard title="Best fits for this cube">
      <p className="ex-note">The cards from all of Magic that would add most where this cube's packages are thin. Pick one, or search above.</p>
      <div className="ex-fits">
        {cards.slice(0, BEST_FITS).map(card => <FitTile key={card.name} card={card} onPick={onPick} />)}
      </div>
    </SectionCard>
  )
}
