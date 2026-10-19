import React from "react"
import { ActionIcon } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import { EditableField } from "../../components/kit/EditableField.js"
import { PlayerPicker } from "../../components/PlayerPicker.js"
import { useDraftDecks, usePlayers } from "../useDeckEdits.js"

// PlayerPickerEditor is the open player editor: the picker, which saves as soon
// as a different player is chosen, and a button to close it unchanged.
function PlayerPickerEditor({ cube, deck, edits, done, copy }) {
  const { players, addPlayer } = usePlayers(true)
  const draftDecks = useDraftDecks(cube, deck, true)

  // Players who already hold another deck in this draft can't be picked.
  const takenIds = draftDecks.filter(d => d.id !== deck.id && d.player_id).map(d => d.player_id)

  function onChange(playerId) {
    if (playerId !== (deck.player_id || 0)) {
      edits.saveRecord(copy.player, { player_id: playerId })
    }
    done()
  }

  return (
    <span className="deck-inline-editor">
      <PlayerPicker players={players} value={deck.player_id || 0} takenIds={takenIds} onAdded={addPlayer} onChange={onChange} />
      <ActionIcon variant="subtle" color="gray" size="sm" aria-label={copy.cancel} onClick={done}>
        <IconX size={14} />
      </ActionIcon>
    </span>
  )
}

// PlayerEdit is the player's name at the top of the deck, with a pencil that
// swaps it for the player picker on writable cubes.
export function PlayerEdit({ cube, deck, edits, copy }) {
  return (
    <EditableField
      editable={edits.editable}
      label={copy.player}
      display={<h2 className="deck-player">{deck.player}</h2>}
      renderEditor={({ done }) => <PlayerPickerEditor cube={cube} deck={deck} edits={edits} done={done} copy={copy} />}
    />
  )
}
