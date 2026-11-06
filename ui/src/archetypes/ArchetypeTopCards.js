// The archetype page's top cards: the cards its decks mainboarded, ranked by
// how much they belong to the archetype, with lands hidden by default.

import React, { useState } from "react"
import { UnstyledButton } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { Checkbox, NumericInput } from "../components/Dropdown.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { TOP_CARD_COLUMNS, shownTopCards } from "./archetypePageModel.js"

// ROWS_SHOWN is how many cards the table lists before "Show all".
const ROWS_SHOWN = 25

// TopCardsControls are the table's settings: hide lands and the fewest decks
// a card needs to be listed.
function TopCardsControls({ hideLands, onHideLands, minDecks, onMinDecks }) {
  return (
    <div className="selector-group archetype-top-controls">
      <Checkbox text="Hide lands" checked={hideLands} onChange={e => onHideLands(e.target.checked)} />
      <NumericInput label="Min decks" value={minDecks} onChange={e => onMinDecks(Number(e.target.value) || 0)} />
    </div>
  )
}

// TopCardRow is one card's row: its name linking to its card page, then its
// counts and shares.
function TopCardRow({ card, cube }) {
  return (
    <tr className="widget-table-row">
      <td><CardLink cube={cube} name={card.name} /></td>
      <td>{card.decks}</td>
      <td>{Math.round(card.in_share)}%</td>
      <td>{Math.round(card.of_card_decks)}%</td>
      <td>{Math.round(card.fit)}</td>
    </tr>
  )
}

// ArchetypeTopCards draws the top cards table with its controls. Clicking a
// header sorts by that column.
export function ArchetypeTopCards({ cards, cube }) {
  const [hideLands, setHideLands] = useState(true)
  const [minDecks, setMinDecks] = useState(2)
  const [sortBy, setSortBy] = useState("fit")
  const [expanded, setExpanded] = useState(false)

  const shown = shownTopCards(cards, { hideLands, minDecks, sortBy })
  let rows = shown
  if (!expanded) {
    rows = shown.slice(0, ROWS_SHOWN)
  }

  return (
    <SectionCard title="Top cards">
      <TopCardsControls hideLands={hideLands} onHideLands={setHideLands} minDecks={minDecks} onMinDecks={setMinDecks} />
      <div className="table-scroll">
        <table className="widget-table">
          <thead className="table-header">
            <tr>
              {TOP_CARD_COLUMNS.map(column => (
                <HoverInfo key={column.id} title={column.text} info={column.tip}>
                  <td className="header-cell" onClick={() => setSortBy(column.id)}>
                    {column.text}{sortBy === column.id ? " ▼" : ""}
                  </td>
                </HoverInfo>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(card => <TopCardRow key={card.name} card={card} cube={cube} />)}
          </tbody>
        </table>
      </div>
      {!expanded && shown.length > ROWS_SHOWN && (
        <UnstyledButton className="card-partner-more" onClick={() => setExpanded(true)}>
          Show all {shown.length}
        </UnstyledButton>
      )}
    </SectionCard>
  )
}
