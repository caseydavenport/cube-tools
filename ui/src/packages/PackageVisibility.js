// The package page's line about whether this cube shows the package: where
// it stands against the relevance line, and on a writable cube a switch to
// always show or always hide it instead.

import React, { useEffect, useState } from "react"
import { SegmentedControl } from "@mantine/core"
import { HoverInfo } from "../components/kit/HoverInfo.js"
import { nextOverrides, switchValue } from "../design/rules/packageOverrides.js"

// LINE_TIP explains the relevance line in one place.
const LINE_TIP = "Judged on this cube's current list. A package clears the line when one of its wires has at least 2 of the cube's enablers and 3 of its payoffs, or 3 and 2; a wire that pairs a group with itself needs 3. A group that matches basic lands always counts. Older date ranges judge each draft by its own list."

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

  // pending is the choice being saved, shown until the reloaded page has it.
  const [pending, setPending] = useState(null)
  useEffect(() => {
    setPending(null)
  }, [page.forced])

  // onChange saves the new choice, clearing any earlier error.
  function onChange(state) {
    setError("")
    setPending(state)
    saveShownState(cube, page.name, state, onSaved, reason => {
      setPending(null)
      setError(`Couldn't save: ${reason}`)
    })
  }

  return (
    <div className="package-visibility">
      <HoverInfo info={LINE_TIP}>
        <span className="package-line-item">{verdictText(page.relevant)}</span>
      </HoverInfo>
      {writable && (
        <SegmentedControl
          size="xs" aria-label="Whether this cube shows the package"
          value={switchValue(pending, page.forced)} onChange={onChange} data={SWITCH_OPTIONS}
        />
      )}
      {error && <span className="de-status" role="status">{error}</span>}
    </div>
  )
}
