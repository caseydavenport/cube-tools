import { test } from "node:test"
import assert from "node:assert/strict"
import { draftList, pickLogSection } from "./draftList.js"

// draft builds an index entry.
function draft(id, date, { decks = [1, 2], hasLog = false, name = "" } = {}) {
  return { id, date, event_name: name, decks, has_log: hasLog }
}

// deck builds a summary deck in a draft.
function deck(draftId, id, player, wins, losses, trophies = 0) {
  return {
    id,
    player,
    player_id: 0,
    metadata: { draft_id: draftId },
    colors: ["R"],
    stats: { match_wins: wins, match_losses: losses, match_draws: 0, trophies },
  }
}

test("drafts outside the range are dropped, and both ends are inclusive", () => {
  const index = { drafts: [draft(1, "2026-01-01"), draft(2, "2026-02-01"), draft(3, "2026-03-01"), draft(4, "2026-04-01")] }
  const ids = draftList(index, [], "2026-02-01", "2026-03-01").map(d => d.id)
  assert.deepEqual(ids, [3, 2])
})

test("drafts are newest first, same-day drafts by id descending", () => {
  const index = { drafts: [draft(1, "2026-06-21"), draft(3, "2026-06-20"), draft(2, "2026-06-21")] }
  assert.deepEqual(draftList(index, [], "1990-09-15", "2026-10-19").map(d => d.id), [2, 1, 3])
})

test("a draft with null decks has 0 players", () => {
  const index = { drafts: [draft(1, "2026-06-21", { decks: null })] }
  assert.equal(draftList(index, [], "1990-09-15", "2026-10-19")[0].players, 0)
})

test("each draft carries its label, winner, log flag, and a deck to open", () => {
  const index = { drafts: [draft(9, "2026-07-26", { hasLog: true, name: "Goodbye SF" })] }
  const decks = [deck(9, 1, "Joan", 1, 2), deck(9, 2, "Ozzy", 3, 0, 1), deck(8, 1, "Stevie", 3, 0, 1)]
  const [entry] = draftList(index, decks, "1990-09-15", "2026-10-19")

  assert.equal(entry.label, "Goodbye SF")
  assert.equal(entry.date, "2026-07-26")
  assert.equal(entry.winner.player, "Ozzy")
  assert.equal(entry.hasLog, true)
  assert.equal(entry.firstDeckRef, "9/1")
})

test("a draft without a log is marked so, and one with no decks has nothing to open", () => {
  const index = { drafts: [draft(5, "2026-07-26", { decks: null })] }
  const [entry] = draftList(index, [], "1990-09-15", "2026-10-19")
  assert.equal(entry.hasLog, false)
  assert.equal(entry.winner, null)
  assert.equal(entry.firstDeckRef, null)
})

test("an empty index has no drafts", () => {
  assert.deepEqual(draftList({ drafts: null }, [], "1990-09-15", "2026-10-19"), [])
  assert.deepEqual(draftList(undefined, [], "1990-09-15", "2026-10-19"), [])
})

test("pickLogSection shows the browser, an empty state, or nothing", () => {
  assert.equal(pickLogSection(true, true), "browser")
  assert.equal(pickLogSection(true, false), "empty")
  assert.equal(pickLogSection(false, false), "hidden")
  assert.equal(pickLogSection(undefined, false), "empty")
})
