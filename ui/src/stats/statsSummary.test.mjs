import { test } from "node:test"
import assert from "node:assert/strict"
import { statsSummary } from "./statsSummary.js"

// deck builds a deck in a draft, played by a named player.
function deck(draftId, player) {
  return { player, metadata: { draft_id: draftId } }
}

test("statsSummary counts distinct drafts and players", () => {
  const decks = [deck(1, "Freddie"), deck(1, "Ozzy")]
  assert.deepEqual(statsSummary(decks), { drafts: 1, decks: 2, players: 2 })
})

test("the same player across drafts counts once", () => {
  const decks = [deck(1, "Freddie"), deck(2, "Freddie")]
  assert.deepEqual(statsSummary(decks), { drafts: 2, decks: 2, players: 1 })
})

test("no decks gives zeros", () => {
  assert.deepEqual(statsSummary([]), { drafts: 0, decks: 0, players: 0 })
})
