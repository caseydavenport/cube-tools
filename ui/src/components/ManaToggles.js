// A row of WUBRG mana symbols that each toggle a color filter on and off.

import React from "react"
import { UnstyledButton } from "@mantine/core"
import { ColorImages } from "../utils/Colors.js"
import "./components.css"

// MANA_COLORS are the toggles, in WUBRG order.
const MANA_COLORS = ["W", "U", "B", "R", "G"]

// COLOR_WORDS name each color for the toggles' tips.
export const COLOR_WORDS = { W: "white", U: "blue", B: "black", R: "red", G: "green" }

// ManaToggles draws the five color toggles. A selected color is shown in full
// with a ring; the rest are faded. selected lists the chosen color letters,
// onToggle gets the clicked letter, and tip gives each toggle's hover text.
export function ManaToggles({ selected, onToggle, tip, label }) {
  return (
    <div className="color-toggles" role="group" aria-label={label}>
      {MANA_COLORS.map(color => {
        const on = selected.includes(color)
        let className = "color-toggle"
        if (on) {
          className += " color-toggle-on"
        }
        return (
          <UnstyledButton
            key={color}
            className={className}
            aria-pressed={on}
            title={tip(color)}
            onClick={() => onToggle(color)}
          >
            {ColorImages(color)}
          </UnstyledButton>
        )
      })}
    </div>
  )
}
