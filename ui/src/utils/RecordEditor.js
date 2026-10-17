// RecordEditor is the model behind the deck record editor: seeding editor
// state from a deck, turning it back into deck.matches, and merging the decks a
// save changed back into the loaded list. It has no imports so it can be
// unit-tested under node directly.

// emptyRow is a blank Rounds-mode row for a match not yet recorded.
export function emptyRow() {
  return { round: 0, opponentId: 0, opponent: "", wins: 0, losses: 0, draws: 0, original: null }
}

// seedRecordEditor builds editor state from a deck. Rounds mode (one row per
// match) is chosen when any match names an opponent; otherwise Override mode,
// which edits only the W-L-D totals. Each row keeps the match it came from so
// an untouched row can be saved back exactly as loaded.
export function seedRecordEditor(deck) {
  const matches = deck.matches || []
  const stats = deck.stats || {}
  const override = {
    wins: stats.match_wins || 0,
    losses: stats.match_losses || 0,
    draws: stats.match_draws || 0,
  }
  return {
    mode: matches.some((m) => m.opponent) ? "rounds" : "override",
    rows: matches.length
      ? matches.map((m) => ({
          round: m.round || 0,
          opponentId: m.opponent_id || 0,
          opponent: m.opponent || "",
          wins: m.wins || 0,
          losses: m.losses || 0,
          draws: m.draws || 0,
          original: m,
        }))
      : [emptyRow()],
    override,
    seededOverride: override,
  }
}

// rowUnchanged reports whether a row still holds exactly what its original
// match had. Form inputs hand back strings, so numbers compare by value.
function rowUnchanged(row) {
  const m = row.original
  return m != null &&
    Number(row.round) === (m.round || 0) &&
    Number(row.opponentId) === (m.opponent_id || 0) &&
    row.opponent === (m.opponent || "") &&
    Number(row.wins) === (m.wins || 0) &&
    Number(row.losses) === (m.losses || 0) &&
    Number(row.draws) === (m.draws || 0)
}

// buildMatches turns editor state into deck.matches. In Rounds mode an
// untouched row returns its original match unchanged, games and all. An edited
// row keeps its round, recomputes the winner from the score, and drops its
// games, since the stored games would contradict the new score. Override mode
// emits opponent-less stubs, one per match result, so the record reads back
// exactly as typed; unchanged totals keep the stored matches, which may carry
// game counts the stubs can't.
export function buildMatches(state, deck) {
  if (state.mode === "rounds") {
    return state.rows
      .filter((r) => r.opponent || r.opponentId || Number(r.wins) || Number(r.losses) || Number(r.draws))
      .map((r) => (rowUnchanged(r) ? r.original : editedMatch(r, deck)))
  }
  const o = state.override
  const seeded = state.seededOverride
  if (deck.matches && seeded && Number(o.wins) === seeded.wins && Number(o.losses) === seeded.losses && Number(o.draws) === seeded.draws) {
    return deck.matches
  }
  const out = []
  for (let i = 0; i < (Number(state.override.wins) || 0); i++) out.push({ wins: 1, losses: 0, draws: 0 })
  for (let i = 0; i < (Number(state.override.losses) || 0); i++) out.push({ wins: 0, losses: 1, draws: 0 })
  for (let i = 0; i < (Number(state.override.draws) || 0); i++) out.push({ wins: 0, losses: 0, draws: 1 })
  return out
}

// editedMatch builds the match for a row the user changed. Round and opponent
// id are omitted when unknown so the server's zero values stay implicit.
function editedMatch(r, deck) {
  const m = {}
  if (Number(r.round)) m.round = Number(r.round)
  m.opponent = r.opponent
  if (Number(r.opponentId)) m.opponent_id = Number(r.opponentId)
  m.wins = Number(r.wins) || 0
  m.losses = Number(r.losses) || 0
  m.draws = Number(r.draws) || 0
  if (m.wins > m.losses) m.winner = deck.player
  else if (m.losses > m.wins) m.winner = r.opponent
  return m
}

// mergeChangedDecks replaces each deck in decks that a save changed, matched by
// draft and deck id, and leaves the rest as they were.
export function mergeChangedDecks(decks, changed) {
  const key = (d) => `${d.metadata && d.metadata.draft_id}/${d.id}`
  const byKey = new Map(changed.map((d) => [key(d), d]))
  return decks.map((d) => byKey.get(key(d)) || d)
}

// opponentOptions lists the decks a row can name as its opponent: the other
// decks in this deck's draft. The row's current opponent is always included,
// so a match against a deck that isn't loaded still shows its name.
export function opponentOptions(draftDecks, deck, row) {
  const did = deck.metadata && deck.metadata.draft_id
  const out = draftDecks
    .filter((d) => d.metadata && d.metadata.draft_id === did && d.id !== deck.id)
    .map((d) => ({ id: d.id, player: d.player }))
  if (row.opponentId && !out.some((o) => o.id === row.opponentId)) {
    out.push({ id: row.opponentId, player: row.opponent })
  }
  return out
}
