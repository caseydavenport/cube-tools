import React, { useState } from 'react'
import { Button, NativeSelect, TextInput } from '@mantine/core'
import { COMPONENTS_COPY } from './copy.js'
import { addPlayer, playerOptions } from '../utils/Players.js'

// addOption is the select value that opens the inline "add player" form.
const addOption = "add"

// PlayerPicker picks a deck's player from the global player list. value is a
// player id, 0 for an anonymous seat. "+ Add player…" opens an inline form
// that adds the player, reports it through onAdded, then selects it. Players
// in takenIds already hold another deck in the draft and can't be picked.
export function PlayerPicker({ players, value, onChange, onAdded, allowAnonymous = true, takenIds, className, disabled }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState(null)

  const submit = async () => {
    setError(null)
    try {
      const p = await addPlayer(name)
      setAdding(false)
      setName("")
      if (onAdded) onAdded(p)
      onChange(p.id)
    } catch (e) {
      setError(e.message)
    }
  }

  if (adding) {
    return (
      <span className="player-picker">
        <TextInput
          size="xs"
          className={className}
          autoFocus
          placeholder={COMPONENTS_COPY.playerPicker.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
            if (e.key === "Escape") setAdding(false)
          }}
        />
        <Button size="compact-sm" onClick={submit} disabled={!name.trim()}>{COMPONENTS_COPY.playerPicker.add}</Button>
        <Button size="compact-sm" variant="default" onClick={() => { setAdding(false); setError(null) }}>{COMPONENTS_COPY.playerPicker.cancel}</Button>
        {error ? <span className="error">{error}</span> : null}
      </span>
    )
  }

  const options = [
    ...(allowAnonymous || !value
      ? [{ value: "0", label: allowAnonymous ? COMPONENTS_COPY.playerPicker.anonymous : COMPONENTS_COPY.playerPicker.pickPlayer }]
      : []),
    ...playerOptions(players, takenIds).map((p) => {
      const taken = p.taken && p.id !== value
      return { value: String(p.id), label: p.name + (taken ? COMPONENTS_COPY.playerPicker.hasDeck : ""), disabled: taken }
    }),
    { value: addOption, label: COMPONENTS_COPY.playerPicker.addPlayer },
  ]

  return (
    <NativeSelect
      size="xs"
      className={className || "player-picker-select"}
      value={String(value || 0)}
      disabled={disabled}
      data={options}
      onChange={(e) => {
        if (e.target.value === addOption) setAdding(true)
        else onChange(Number(e.target.value))
      }}
    />
  )
}
