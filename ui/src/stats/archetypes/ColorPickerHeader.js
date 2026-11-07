// The Archetypes page's color filter in the toolbar: one toggle per color,
// drawn as its mana symbol.

import React from "react"
import { UnstyledButton } from "@mantine/core"
import { ColorImages } from "../../utils/Colors.js"

// PICKER_COLORS are the toggles, in WUBRG order, matching the order of the
// display flags.
const PICKER_COLORS = ["W", "U", "B", "R", "G"]

// COLOR_WORDS name each color for the toggles' tips and screen readers.
const COLOR_WORDS = { W: "white", U: "blue", B: "black", R: "red", G: "green" }

// ColorPickerHeader draws the five color toggles. A selected color is shown
// in full with a ring; the rest are faded. With none selected, every deck
// shows. display holds whether each is selected, in WUBRG order; onChecked
// gets the click, whose currentTarget id is the color letter.
export function ColorPickerHeader(input) {
  return (
    <div className="color-toggles" role="group" aria-label="Deck colors">
      {PICKER_COLORS.map((color, i) => {
        const selected = input.display[i]
        let className = "color-toggle"
        if (selected) {
          className += " color-toggle-on"
        }
        return (
          <UnstyledButton
            key={color}
            id={color}
            className={className}
            aria-pressed={selected}
            title={`Only decks that play ${COLOR_WORDS[color]}`}
            onClick={input.onChecked}
          >
            {ColorImages(color)}
          </UnstyledButton>
        )
      })}
    </div>
  )
}
