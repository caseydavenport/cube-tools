// The Removal page's "Hard to remove" table: the cube's creatures, fewest
// spot-removal answers first, for any deck or for the color the page's color
// filter picks.

import React from "react"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { ColorImages } from "../utils/Colors.js"
import { hardToRemoveRows } from "./scatterPoints.js"
import { CardLink } from "../components/CardLink.js"
import { useCube } from "../contexts/CubeContext.js"

// COLOR_NAMES name the page's color filter in the table's description.
const COLOR_NAMES = { W: "white", U: "blue", B: "black", R: "red", G: "green" }

// removalCardsFor is how many spot-removal cards a deck of the color can play:
// that color's cards plus colorless ones. With no color, it's every card.
function removalCardsFor(color, byColor, removalCards) {
  if (!color) {
    return removalCards
  }
  let count = 0
  for (const row of byColor) {
    if (row.color === color || row.color === "C") {
      count += row.cards
    }
  }
  return count
}

// answeredByTip explains the count column, and which removal it includes
// under the page's color filter.
function answeredByTip(color) {
  let which = "Spot-removal cards in the cube"
  if (color) {
    which = `Spot-removal cards a ${COLOR_NAMES[color]} deck can play (${COLOR_NAMES[color]} or colorless)`
  }
  return `${which} that can kill this creature, given their restrictions. X spells count, since enough mana kills anything.`
}

// HardToRemove lists the cube's creatures by how many spot-removal cards can
// kill them. color is the page's color filter, "" for all colors.
export function HardToRemove({ creatures, byColor, removalCards, color }) {
  const cube = useCube()
  const total = removalCardsFor(color, byColor, removalCards)

  return (
    <SectionCard title="Hard to remove">
      <div className="removal-hard-scroll">
        <table className="widget-table stats-full-width">
          <thead>
            <tr>
              <td className="header-cell">Creature</td>
              <td className="header-cell">Colors</td>
              <td className="header-cell page-right-cell">MV</td>
              <HoverInfo title="Answered by" info={answeredByTip(color)}>
                <td className="header-cell page-right-cell">Answered by</td>
              </HoverInfo>
            </tr>
          </thead>
          <tbody>
            {hardToRemoveRows(creatures, color).map(creature => (
              <tr key={creature.name} className="widget-table-row">
                <td className="header-cell stats-bold"><CardLink cube={cube} name={creature.name} /></td>
                <td>{ColorImages(creature.colors || [])}</td>
                <td className="page-right-cell">{creature.mv}</td>
                <td className="page-right-cell">{creature.answers[color] || 0} of {total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
