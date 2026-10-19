import React, { useState } from "react"
import { Text, TextInput } from "@mantine/core"
import { EditableField } from "../components/kit/EditableField.js"
import { inlineEditKeys } from "../components/kit/inlineEditKeys.js"
import { renamePlayer } from "../utils/Players.js"

// RenameInput is the open rename editor. Enter or clicking away saves; Escape
// cancels. A blank or unchanged name just closes it. A failed rename keeps the
// editor open with the server's reason under it.
function RenameInput({ player, onRenamed, done, copy }) {
  const [name, setName] = useState(player.name)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const next = name.trim()
    if (next === "" || next === player.name) {
      done()
      return
    }

    setSaving(true)
    setError(null)
    try {
      await renamePlayer(player.id, next)
      onRenamed()
      done()
    } catch (err) {
      setError(`${copy.renameError}: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(event) {
    const action = inlineEditKeys(event.key)
    if (action === "save") {
      save()
    } else if (action === "cancel") {
      done()
    }
  }

  return (
    <div>
      <TextInput
        size="sm"
        autoFocus
        aria-label={copy.renameLabel}
        value={name}
        disabled={saving}
        onChange={event => setName(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={save}
      />
      {error && <Text className="player-rename-error" role="alert">{error}</Text>}
    </div>
  )
}

// PlayerRename is the player's name at the top of their details. A pencil beside
// it renames them in the global player list, shown only on writable cubes and
// only for players in that list (those with an id).
export function PlayerRename({ player, editable, onRenamed, copy }) {
  return (
    <EditableField
      editable={editable && Boolean(player.id)}
      label={copy.renameLabel}
      display={<h2 className="deck-player">{player.name}</h2>}
      renderEditor={({ done }) => <RenameInput player={player} onRenamed={onRenamed} done={done} copy={copy} />}
    />
  )
}
