import { test } from "node:test"
import assert from "node:assert/strict"
import { seedRecordEditor, buildMatches, mergeChangedDecks, opponentOptions } from "./RecordEditor.js"

const deck = {
  id: 1, player: "Sarah", metadata: { draft_id: 1 },
  stats: { match_wins: 0, match_losses: 2, match_draws: 0 },
  matches: [
    { opponent: "An", opponent_id: 2, round: 1, wins: 1, losses: 2, draws: 0, winner: "An",
      games: [{ opponent: "An", winner: "Sarah" }, { opponent: "An", winner: "An" }, { opponent: "An", winner: "An" }] },
    { opponent: "Patrick", opponent_id: 3, round: 2, wins: 1, losses: 2, draws: 0 },
  ],
}

test("untouched rows round-trip exactly", () => {
  assert.deepEqual(buildMatches(seedRecordEditor(deck), deck), deck.matches)
})

test("edited row keeps round, recomputes winner, drops games", () => {
  const s = seedRecordEditor(deck)
  s.rows[0] = { ...s.rows[0], wins: 2, losses: 1 }
  const [m, other] = buildMatches(s, deck)
  assert.deepEqual(m, { round: 1, opponent: "An", opponent_id: 2, wins: 2, losses: 1, draws: 0, winner: "Sarah" })
  assert.equal(other, deck.matches[1])
})

test("a loss names the opponent as winner", () => {
  const s = seedRecordEditor(deck)
  s.rows[1] = { ...s.rows[1], wins: 0 }
  assert.equal(buildMatches(s, deck)[1].winner, "Patrick")
})

test("draw omits winner", () => {
  const s = seedRecordEditor(deck)
  s.rows[0] = { ...s.rows[0], wins: 1, losses: 1, draws: 1 }
  assert.equal("winner" in buildMatches(s, deck)[0], false)
})

test("string inputs from form fields count as numbers", () => {
  const s = seedRecordEditor(deck)
  s.rows[0] = { ...s.rows[0], wins: "1", losses: "2", draws: "0" }
  assert.equal(buildMatches(s, deck)[0], deck.matches[0])
})

test("new rows without a round or opponent id omit those keys; empty rows drop", () => {
  const s = seedRecordEditor(deck)
  s.rows.push({ round: 0, opponentId: 0, opponent: "", wins: 0, losses: 0, draws: 0, original: null })
  s.rows.push({ round: 0, opponentId: 0, opponent: "Ghost", wins: 2, losses: 0, draws: 0, original: null })
  const out = buildMatches(s, deck)
  assert.equal(out.length, 3)
  assert.deepEqual(out[2], { opponent: "Ghost", wins: 2, losses: 0, draws: 0, winner: "Sarah" })
})

test("seed picks rounds mode when any match has an opponent", () => {
  const s = seedRecordEditor(deck)
  assert.equal(s.mode, "rounds")
  assert.equal(s.rows.length, 2)
  assert.deepEqual({ ...s.rows[0], original: null },
    { round: 1, opponentId: 2, opponent: "An", wins: 1, losses: 2, draws: 0, original: null })
})

test("override mode seeds from the record and emits stubs", () => {
  const stubbed = { ...deck, matches: [{ wins: 1 }, { wins: 1 }, { losses: 1 }],
    stats: { match_wins: 2, match_losses: 1, match_draws: 0 } }
  const s = seedRecordEditor(stubbed)
  assert.equal(s.mode, "override")
  assert.deepEqual(s.override, { wins: 2, losses: 1, draws: 0 })
  s.override = { ...s.override, draws: 1 }
  assert.deepEqual(buildMatches(s, stubbed), [
    { wins: 1, losses: 0, draws: 0 }, { wins: 1, losses: 0, draws: 0 }, { wins: 0, losses: 1, draws: 0 },
    { wins: 0, losses: 0, draws: 1 },
  ])
})

test("a deck with no matches seeds one empty row", () => {
  const s = seedRecordEditor({ ...deck, matches: null, stats: undefined })
  assert.equal(s.mode, "override")
  assert.equal(s.rows.length, 1)
  assert.deepEqual(s.override, { wins: 0, losses: 0, draws: 0 })
})

test("mergeChangedDecks replaces by draft and id, leaves others", () => {
  const a1 = { id: 1, player: "A", metadata: { draft_id: 1 } }
  const b1 = { id: 2, player: "B", metadata: { draft_id: 1 } }
  const a2 = { id: 1, player: "A", metadata: { draft_id: 2 } }
  const renamed = { id: 1, player: "Z", metadata: { draft_id: 1 } }
  const out = mergeChangedDecks([a1, b1, a2], [renamed])
  assert.deepEqual(out, [renamed, b1, a2])
})

test("override save with unchanged totals keeps aggregate stubs", () => {
  const aggregate = { ...deck, matches: [{ wins: 4, losses: 1, draws: 0 }],
    stats: { match_wins: 1, match_losses: 0, match_draws: 0 } }
  const s = seedRecordEditor(aggregate)
  assert.equal(s.mode, "override")
  assert.equal(buildMatches(s, aggregate), aggregate.matches)
})

test("override save with changed totals rebuilds stubs", () => {
  const aggregate = { ...deck, matches: [{ wins: 4, losses: 1, draws: 0 }],
    stats: { match_wins: 1, match_losses: 0, match_draws: 0 } }
  const s = seedRecordEditor(aggregate)
  s.override = { ...s.override, losses: "1" }
  assert.deepEqual(buildMatches(s, aggregate), [{ wins: 1, losses: 0, draws: 0 }, { wins: 0, losses: 1, draws: 0 }])
})

test("opponentOptions lists the draft's other decks", () => {
  const draftDecks = [
    { id: 1, player: "Sarah", metadata: { draft_id: 1 } },
    { id: 2, player: "An", metadata: { draft_id: 1 } },
    { id: 9, player: "Elsewhere", metadata: { draft_id: 2 } },
  ]
  const row = { opponentId: 2, opponent: "An" }
  assert.deepEqual(opponentOptions(draftDecks, deck, row), [{ id: 2, player: "An" }])
})

test("opponentOptions keeps the row's opponent when it isn't loaded", () => {
  const row = { opponentId: 3, opponent: "Patrick" }
  assert.deepEqual(opponentOptions([], deck, row), [{ id: 3, player: "Patrick" }])
})
