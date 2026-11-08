import React, { useRef, useState } from "react"
import { Autocomplete, Text } from "@mantine/core"
import { EditableField } from "../components/kit/EditableField.js"
import { inlineEditKeys } from "../components/kit/inlineEditKeys.js"
import { NO_GROUP, setPlayerGroup } from "../utils/Players.js"

// GroupInput is the open play group editor, suggesting the groups players are
// already in. Enter, picking a suggestion or clicking away saves; Escape
// cancels. Clearing the box takes the player out of their group.
function GroupInput({ player, groups, onChanged, done }) {
  const [text, setText] = useState(player.group || "")
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Enter on a highlighted suggestion fires both the key handler and the
  // suggestion handler. This ref keeps the second one from saving again.
  const saved = useRef(false)

  async function save(value) {
    if (saved.current) {
      return
    }
    const next = value.trim()
    if (next === (player.group || "")) {
      done()
      return
    }

    saved.current = true
    setSaving(true)
    setError(null)
    try {
      await setPlayerGroup(player.id, next)
      onChanged()
      done()
    } catch (err) {
      saved.current = false
      setError(`Couldn't set the play group: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(event) {
    const action = inlineEditKeys(event.key)
    if (action === "save") {
      save(text)
    } else if (action === "cancel") {
      done()
    }
  }

  return (
    <div>
      <Autocomplete
        size="xs"
        w={180}
        autoFocus
        aria-label="play group"
        placeholder={NO_GROUP}
        data={groups}
        value={text}
        disabled={saving}
        onChange={setText}
        onOptionSubmit={save}
        onKeyDown={onKeyDown}
        onBlur={() => save(text)}
      />
      {error && <Text className="player-rename-error" role="alert">{error}</Text>}
    </div>
  )
}

// PlayerGroup shows the player's play group as a chip beside their name. A
// pencil beside it changes the group, shown only on writable cubes and only
// for players in the global list (those with an id).
export function PlayerGroup({ player, groups, editable, onChanged }) {
  const group = player.group || NO_GROUP
  const chipClass = player.group ? "players-group" : "players-group players-group-none"

  return (
    <EditableField
      editable={editable && Boolean(player.id)}
      label="play group"
      display={<span className={chipClass} title="Play group">{group}</span>}
      renderEditor={({ done }) => <GroupInput player={player} groups={groups} onChanged={onChanged} done={done} />}
    />
  )
}
