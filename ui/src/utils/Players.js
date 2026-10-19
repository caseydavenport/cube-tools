// Players talks to the global player list (/api/players) and answers the
// questions the UI asks about who played a deck. It has no imports so it can
// be unit-tested under node directly.

// isSeatLabel reports whether a name is an anonymous seat label like "p3".
// Player names can't take that form, so it never matches a real player.
export function isSeatLabel(name) {
  return /^p\d+$/.test(name || "")
}

// isAnonymous reports whether a deck is an anonymous seat: no player id, shown
// by its seat label (its seat, or its deck id when no seat is stored).
// Per-player views leave these out, since every draft reuses the same labels.
export function isAnonymous(deck) {
  return !deck.player_id && deck.player === `p${deck.seat || deck.id}`
}

// personLabel names who played a deck, distinct across drafts: the player's
// name, or for an anonymous seat its label and draft. Use it to count or list
// distinct people, where bare seat labels would merge.
export function personLabel(deck) {
  if (isAnonymous(deck)) {
    return `${deck.player} (draft ${deck.metadata && deck.metadata.draft_id})`
  }
  return deck.player
}

// recordsByOpponent tallies a player's games by opponent: wins, losses, and
// ties, which count as neither. Anonymous opponents are skipped, since seats
// in different drafts share labels.
export function recordsByOpponent(decks) {
  const byOpponent = new Map()
  for (const deck of decks) {
    for (const game of deck.games || []) {
      if (isSeatLabel(game.opponent)) continue
      if (!byOpponent.has(game.opponent)) {
        byOpponent.set(game.opponent, { name: game.opponent, wins: 0, losses: 0, ties: 0 })
      }
      const r = byOpponent.get(game.opponent)
      if (game.tie || !game.winner) r.ties += 1
      else if (game.winner === game.opponent) r.losses += 1
      else r.wins += 1
    }
  }
  return Array.from(byOpponent.values())
}

// playerNameMatches reports whether a player: search value names this player.
// It takes the whole name, ignoring case and quotes, so p3 doesn't also match
// seat p30. The server's query engine uses the same rule.
export function playerNameMatches(player, value) {
  return (player || "").toLowerCase() === value.replace(/"/g, "").toLowerCase()
}

// matchPlayerByName returns the id of the player whose name matches hint,
// ignoring case and surrounding space, or 0.
export function matchPlayerByName(players, hint) {
  const want = (hint || "").trim().toLowerCase()
  if (!want) return 0
  const p = (players || []).find((p) => p.name.toLowerCase() === want)
  return p ? p.id : 0
}

// playerOptions sorts players by name for a picker, marking those whose ids
// are in takenIds (already holding another deck in the draft).
export function playerOptions(players, takenIds) {
  const taken = new Set(takenIds || [])
  return [...(players || [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((p) => ({ id: p.id, name: p.name, taken: taken.has(p.id) }))
}

// playersRequest sends a request to the player API and returns the parsed
// body, or throws with the server's message.
async function playersRequest(path, init) {
  const resp = await fetch(path, init)
  if (!resp.ok) {
    const msg = (await resp.text()).trim()
    throw new Error(msg || `Request failed: ${resp.status}`)
  }
  return resp.json()
}

// fetchPlayers loads the whole player list.
export async function fetchPlayers() {
  const data = await playersRequest("/api/players")
  return data.players || []
}

// addPlayer adds a player and returns it, with its new id.
export async function addPlayer(name) {
  return playersRequest("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
}

// renamePlayer changes a player's display name and returns the player.
export async function renamePlayer(id, name) {
  return playersRequest(`/api/players/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
}
