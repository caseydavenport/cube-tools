import React from "react"
import { Badge, Select } from "@mantine/core"
import { EditableField } from "../../components/kit/EditableField.js"
import { inlineEditKeys } from "../../components/kit/inlineEditKeys.js"
import { archetypeLabel } from "../deckModel.js"

// ARCHETYPE_VALUES are the stored archetype values; "" means none.
const ARCHETYPE_VALUES = ["", "aggro", "midrange", "control"]

// ArchetypeSelect is the open archetype editor. Choosing an option saves it;
// Escape or clicking away closes it unchanged.
function ArchetypeSelect({ deck, edits, done, copy }) {
  const options = ARCHETYPE_VALUES.map(value => ({
    value,
    label: archetypeLabel({ macro_archetype: value }) || copy.noArchetype,
  }))

  function onChange(value) {
    if (value !== null && value !== (deck.macro_archetype || "")) {
      edits.saveMeta(copy.archetype, { macro: value })
    }
    done()
  }

  function onKeyDown(event) {
    if (inlineEditKeys(event.key) === "cancel") {
      done()
    }
  }

  return (
    <Select
      size="xs"
      w={140}
      autoFocus
      defaultDropdownOpened
      allowDeselect={false}
      aria-label={copy.archetype}
      data={options}
      value={deck.macro_archetype || ""}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={done}
    />
  )
}

// ArchetypeEdit is the archetype badge beside the player's name. On writable
// cubes a pencil swaps it for a dropdown, and a deck with no archetype shows a
// muted placeholder so there's something to click.
export function ArchetypeEdit({ deck, edits, copy }) {
  const label = archetypeLabel(deck)

  let display = null
  if (label) {
    display = <Badge variant="light" radius="xl">{label}</Badge>
  } else if (edits.editable) {
    display = <span className="deck-muted">{copy.noArchetype}</span>
  }

  return (
    <EditableField
      editable={edits.editable}
      label={copy.archetype}
      display={display}
      renderEditor={({ done }) => <ArchetypeSelect deck={deck} edits={edits} done={done} copy={copy} />}
    />
  )
}
