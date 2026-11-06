// The Archetypes page's color filter in the toolbar: one checkbox per color.

import React from "react"
import { Checkbox } from "../../components/Dropdown.js"
import { ColorImages } from "../../utils/Colors.js"

// PICKER_COLORS are the checkboxes, in WUBRG order, matching the order of the
// display flags.
const PICKER_COLORS = ["W", "U", "B", "R", "G"]

// ColorPickerHeader draws the five color checkboxes. display holds whether
// each is checked, in WUBRG order; onChecked gets the click, whose target id
// is the color letter.
export function ColorPickerHeader(input) {
  return (
    <div className="selector-group stats-row-centered-padded">
      {PICKER_COLORS.map((color, i) => (
        <Checkbox
          key={color}
          text={ColorImages(color)}
          id={color}
          checked={input.display[i]}
          onChange={input.onChecked}
        />
      ))}
    </div>
  )
}
