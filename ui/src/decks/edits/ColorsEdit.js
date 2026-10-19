import React from "react"
import { ActionIcon, Chip, Group } from "@mantine/core"
import { IconCheck } from "@tabler/icons-react"
import { EditableField } from "../../components/kit/EditableField.js"
import { ColorImages } from "../../utils/Colors.js"
import { toggleColor } from "../deckEdits.js"

const COLORS = ["W", "U", "B", "R", "G"]

// ColorChips is the open colors editor: a toggle chip per color, and an
// "Inferred" chip that drops the override so the colors come from the cards
// again. Each click saves; the check button closes the editor.
function ColorChips({ deck, edits, done, copy }) {
  const override = deck.colors_override || []
  const inferred = override.length === 0

  function onToggle(color) {
    edits.saveMeta(copy.colors, { colors: toggleColor(deck.colors || [], color) })
  }

  function onInferred() {
    if (!inferred) {
      edits.saveMeta(copy.colors, { colors: [] })
    }
  }

  return (
    <Group gap={4} className="deck-inline-editor">
      {COLORS.map(color => (
        <Chip key={color} size="xs" checked={(deck.colors || []).includes(color)} onChange={() => onToggle(color)}>
          <span className="deck-chip-mana">{ColorImages(color)}</span>
        </Chip>
      ))}
      <Chip size="xs" variant="outline" checked={inferred} onChange={onInferred}>
        {copy.inferred}
      </Chip>
      <ActionIcon variant="subtle" size="sm" aria-label={copy.done} onClick={done}>
        <IconCheck size={14} />
      </ActionIcon>
    </Group>
  )
}

// ColorsEdit is the deck's mana icons beside the player's name, with a pencil
// that opens the color chips on writable cubes.
export function ColorsEdit({ deck, edits, copy }) {
  return (
    <EditableField
      editable={edits.editable}
      label={copy.colors}
      display={<span className="deck-mana">{ColorImages(deck.colors)}</span>}
      renderEditor={({ done }) => <ColorChips deck={deck} edits={edits} done={done} copy={copy} />}
    />
  )
}
