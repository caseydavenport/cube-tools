import React, { useState } from 'react'
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
        <input
          className={className || "text-input"}
          autoFocus
          placeholder="First Last"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit()
            if (e.key === "Escape") setAdding(false)
          }}
        />
        <button type="button" onClick={submit} disabled={!name.trim()}>Add</button>
        <button type="button" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
        {error ? <span className="error">{error}</span> : null}
      </span>
    )
  }

  return (
    <select
      className={className || "text-input"}
      value={value || 0}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === addOption) setAdding(true)
        else onChange(Number(e.target.value))
      }}
    >
      {allowAnonymous || !value ? <option value={0}>{allowAnonymous ? "Anonymous" : "Pick a player…"}</option> : null}
      {playerOptions(players, takenIds).map((p) => (
        <option key={p.id} value={p.id} disabled={p.taken && p.id !== value}>
          {p.name}{p.taken && p.id !== value ? " (has a deck here)" : ""}
        </option>
      ))}
      <option value={addOption}>+ Add player…</option>
    </select>
  )
}
