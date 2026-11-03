// The package page's line about whether this cube shows the package: where
// it stands against the relevance line, and on a writable cube a switch to
// always show or always hide it instead.

import React, { useState } from "react"
import { SegmentedControl } from "@mantine/core"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { nextOverrides, shownState } from "../design/rules/packageOverrides.js"

// LINE_TIP explains the relevance line in one place.
const LINE_TIP = "A package shows on this cube's pages when one of its wires links at least 2 of the cube's cards with at least 3 more. Cards cut from the cube don't count."

// SWITCH_OPTIONS are the switch's choices, in order.
const SWITCH_OPTIONS = [
  { value: "line", label: "Follow the line" },
  { value: "on", label: "Always show" },
  { value: "off", label: "Always hide" },
]

// verdictText says where the package stands against the line.
function verdictText(relevant) {
  if (relevant) {
    return "Clears the line in this cube"
  }
  return "Below the line in this cube"
}

// saveShownState reads the cube's overrides, sets name to state, and saves
// them. It calls onSaved after a save, or onError with a reason.
function saveShownState(cube, name, state, onSaved, onError) {
  fetch(`/api/${cube}/package-overrides`)
    .then(r => {
      if (!r.ok) {
        throw new Error(r.statusText)
      }
      return r.json()
    })
    .then(current => fetch(`/api/${cube}/package-overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextOverrides(current, name, state)),
    }))
    .then(r => {
      if (!r.ok) {
        throw new Error(r.statusText)
      }
      onSaved()
    })
    .catch(e => onError(e.message))
}

// PackageVisibility is the line for page, the /stats/package answer. The
// switch shows only when writable is true; onSaved runs after a change saves.
export function PackageVisibility({ cube, page, writable, onSaved }) {
  const [error, setError] = useState("")

  // onChange saves the new choice, clearing any earlier error.
  function onChange(state) {
    setError("")
    saveShownState(cube, page.name, state, onSaved, reason => setError(`Couldn't save: ${reason}`))
  }

  return (
    <div className="package-visibility">
      <HoverInfo info={LINE_TIP}>
        <span className="package-line-item">{verdictText(page.relevant)}</span>
      </HoverInfo>
      {writable && (
        <SegmentedControl
          size="xs" aria-label="Whether this cube shows the package"
          value={shownState(page.forced)} onChange={onChange} data={SWITCH_OPTIONS}
        />
      )}
      {error && <span className="de-status" role="status">{error}</span>}
    </div>
  )
}
