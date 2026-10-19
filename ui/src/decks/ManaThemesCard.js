import React from "react"
import { Text } from "@mantine/core"
import { ManaPipBar } from "../utils/Colors.js"
import { CountManaPips } from "../utils/Utils.js"
import { SectionCard } from "../components/kit/SectionCard.js"
import { leansInto } from "./deckModel.js"

// ThemeChip is one "Leans into" theme: the design-map group's name and how
// rare it is to run that many of its cards.
function ThemeChip({ theme, copy }) {
  return (
    <span className="deck-theme" title={`${theme.count} ${copy.cardsLower}`}>
      {theme.name}
      <span className="deck-theme-rank">{copy.top} {theme.topPercent}%</span>
    </span>
  )
}

// ManaThemesCard shows the mainboard's colored mana symbols as a bar, and the
// design-map groups the deck runs more of than most decks do.
export function ManaThemesCard({ deck, groupDistributions, copy }) {
  const mainboard = deck.mainboard || []
  const themes = leansInto(groupDistributions, mainboard)

  return (
    <SectionCard title={copy.manaSymbols}>
      <ManaPipBar counts={CountManaPips(mainboard)} />

      {themes.length > 0 && (
        <>
          <Text className="kit-section-title deck-themes-title">{copy.leansInto}</Text>
          <div className="deck-themes">
            {themes.map(theme => <ThemeChip key={theme.name} theme={theme} copy={copy} />)}
          </div>
        </>
      )}
    </SectionCard>
  )
}
