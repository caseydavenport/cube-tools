import { test } from "node:test"
import assert from "node:assert/strict"
import { dateBadge, draftWinner, recentDrafts } from "./recentDrafts.js"

// deck builds the fields the winner rule reads.
function deck(draftId, player, wins, losses, draws = 0, trophies = 0) {
  return {
    metadata: { draft_id: draftId },
    player,
    colors: ["B", "G"],
    stats: { match_wins: wins, match_losses: losses, match_draws: draws, trophies },
  }
}

test("dateBadge splits a date into day and short month", () => {
  assert.deepEqual(dateBadge("2026-10-13"), { day: "13", month: "OCT" })
  assert.deepEqual(dateBadge("2026-07-05"), { day: "5", month: "JUL" })
})

test("dateBadge rejects other date formats", () => {
  assert.equal(dateBadge("13/10/2026"), null)
  assert.equal(dateBadge(undefined), null)
})

test("the single undefeated deck wins", () => {
  const decks = [deck(1, "Ozzy", 3, 0, 0, 1), deck(1, "Joan", 2, 1)]
  assert.deepEqual(draftWinner(decks), { player: "Ozzy", colors: ["B", "G"], record: "3-0" })
})

test("without a single undefeated deck, the best record wins", () => {
  const decks = [deck(1, "Ozzy", 2, 0, 1), deck(1, "Joan", 2, 1), deck(1, "Stevie", 1, 1, 1)]
  assert.deepEqual(draftWinner(decks), { player: "Ozzy", colors: ["B", "G"], record: "2-0-1" })
})

test("two undefeated decks fall back to record, and a tie there means no winner", () => {
  const decks = [deck(1, "Ozzy", 3, 0, 0, 1), deck(1, "Joan", 3, 0, 0, 1)]
  assert.equal(draftWinner(decks), null)
})

test("a draft with no matches has no winner", () => {
  assert.equal(draftWinner([deck(1, "Ozzy", 0, 0), deck(1, "Joan", 0, 0)]), null)
  assert.equal(draftWinner([]), null)
})

test("recentDrafts lists the newest drafts first with names, player counts, and winners", () => {
  const index = {
    drafts: [
      { id: 6, date: "2026-06-21", event_name: "Boston Cube Party", flight: "Morning", has_log: true, decks: [{ id: 1 }, { id: 2 }] },
      { id: 7, date: "2026-06-21", has_log: false, decks: [{ id: 1 }] },
      { id: 5, date: "2026-01-02", event_name: "Old", has_log: false, decks: [] },
    ],
  }
  const decks = [deck(6, "Ozzy", 3, 0, 0, 1), deck(6, "Joan", 0, 3), deck(7, "Freddie", 0, 0)]

  const rows = recentDrafts(index, decks, d => d.player, 2)

  assert.deepEqual(rows, [
    { id: 7, name: "Draft #7", badge: { day: "21", month: "JUN" }, players: 1, winner: null, hasLog: false },
    {
      id: 6,
      name: "Boston Cube Party (Morning)",
      badge: { day: "21", month: "JUN" },
      players: 2,
      winner: { player: "Ozzy", colors: ["B", "G"], record: "3-0" },
      hasLog: true,
    },
  ])
})

test("recentDrafts of a missing index is empty", () => {
  assert.deepEqual(recentDrafts(undefined, [], d => d.player), [])
})
