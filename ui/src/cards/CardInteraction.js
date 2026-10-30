// The card page's interaction section: for a creature, the cube's spot
// removal that can kill it; for removal, what it can kill and at what cost.

import React, { useState } from "react"
import { UnstyledButton } from "@mantine/core"
import { CardLink } from "../components/CardLink.js"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"

// RemovalLine describes one mode of the card as removal: how many cube
// creatures it kills, its kind, restriction and effective cost.
function RemovalLine({ row, creatures }) {
  if (row.scalable) {
    return <div className="card-interaction-line">{row.name}: scales with the mana spent ({row.kind}, {row.restriction})</div>
  }
  return (
    <div className="card-interaction-line">
      Kills {row.targets} of {creatures} cube creatures ({Math.round(row.pct_cube)}%) · {row.kind}, {row.restriction} · costs {row.eff_cost}
    </div>
  )
}

// ANSWERS_SHOWN is how many answering cards show before "Show all".
const ANSWERS_SHOWN = 12

// Answers lists the removal that can kill the card, ANSWERS_SHOWN at first.
function Answers({ answers, cube }) {
  const [expanded, setExpanded] = useState(false)
  let shown = answers
  if (!expanded) {
    shown = answers.slice(0, ANSWERS_SHOWN)
  }
  return (
    <>
      <div className="card-interaction-line">Answered by {answers.length} of the cube's spot removal</div>
      <div className="kit-chips">
        {shown.map(name => <CardLink key={name} cube={cube} name={name} className="kit-chip kit-chip-neutral" />)}
        {!expanded && answers.length > ANSWERS_SHOWN && (
          <UnstyledButton className="kit-chip kit-chip-more" onClick={() => setExpanded(true)}>
            Show all {answers.length}
          </UnstyledButton>
        )}
      </div>
    </>
  )
}

// CardInteraction shows the card's answers and coverage, hidden when it's
// neither a creature with answers nor removal.
export function CardInteraction({ page, cube }) {
  const interaction = page.interaction
  const answers = interaction.answered_by
  const removal = interaction.removal
  if (answers.length === 0 && removal.length === 0) {
    return null
  }

  const title = (
    <HoverInfo title="Interaction" info="Counted the way the Removal page counts spot removal and the creatures it can kill.">
      <span>Interaction</span>
    </HoverInfo>
  )
  return (
    <SectionCard title={title}>
      {removal.map(row => <RemovalLine key={row.name} row={row} creatures={interaction.creatures} />)}
      {answers.length > 0 && <Answers answers={answers} cube={cube} />}
    </SectionCard>
  )
}
