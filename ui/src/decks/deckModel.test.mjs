import { test } from "node:test"
import assert from "node:assert/strict"
import {
  archetypeLabel,
  copyListText,
  deckRef,
  groupByDraft,
  leansInto,
  listSummary,
  matchRows,
  resolveSelectedDeck,
  sortDecks,
} from "./deckModel.js"

// deck builds the fields the deck page reads. Records are match wins and
// losses; games follow the match record so the game win rate is defined.
function deck({ draftId = 48, id = 5, player = "Ozzy", date = "2026-07-26", eventName = "Goodbye SF", wins = 0, losses = 0, draws = 0, archetype = "", matches = [] } = {}) {
  return {
    id,
    player,
    date,
    macro_archetype: archetype,
    metadata: { draft_id: draftId },
    draft: { id: draftId, date, event_name: eventName },
    matches,
    games: [],
    stats: {
      match_wins: wins,
      match_losses: losses,
      match_draws: draws,
      game_wins: wins * 2,
      game_losses: losses * 2,
    },
  }
}

test("deckRef joins the draft and deck ids", () => {
  assert.equal(deckRef(deck({ draftId: 48, id: 5 })), "48/5")
})

test("archetypeLabel capitalizes a known archetype and is null otherwise", () => {
  assert.equal(archetypeLabel(deck({ archetype: "aggro" })), "Aggro")
  assert.equal(archetypeLabel(deck({ archetype: "" })), null)
})

test("sorting by date puts the newer draft first", () => {
  const older = deck({ draftId: 40, date: "2026-01-10" })
  const newer = deck({ draftId: 48, date: "2026-07-26" })
  assert.deepEqual(sortDecks([older, newer], "date"), [newer, older])
})

test("sorting by record puts 3-0 above 2-1", () => {
  const twoOne = deck({ id: 1, wins: 2, losses: 1 })
  const threeOh = deck({ id: 2, wins: 3, losses: 0 })
  assert.deepEqual(sortDecks([twoOne, threeOh], "record"), [threeOh, twoOne])
})

test("sorting by player is alphabetical", () => {
  const ozzy = deck({ id: 1, player: "Ozzy" })
  const joan = deck({ id: 2, player: "Joan" })
  assert.deepEqual(sortDecks([ozzy, joan], "player"), [joan, ozzy])
})

test("groupByDraft makes one labeled group per draft", () => {
  const a = deck({ draftId: 48, id: 1 })
  const b = deck({ draftId: 48, id: 2 })
  const c = deck({ draftId: 40, id: 3, date: "2026-01-10", eventName: "" })
  const groups = groupByDraft([a, b, c])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].label, "GOODBYE SF · JUL 26")
  assert.deepEqual(groups[0].decks, [a, b])
  assert.equal(groups[1].label, "DRAFT #40 · JAN 10")
})

test("listSummary totals the decks' match records", () => {
  const summary = listSummary([deck({ wins: 3, losses: 0 }), deck({ wins: 1, losses: 2, draws: 1 })])
  assert.deepEqual(summary, { count: 2, wins: 4, losses: 2, draws: 1, winPercent: 67 })
})

test("resolveSelectedDeck tells none, found, and missing apart", () => {
  const d = deck({ draftId: 48, id: 5 })
  assert.deepEqual(resolveSelectedDeck([d], ""), { status: "none" })
  assert.deepEqual(resolveSelectedDeck([d], "48/5"), { status: "found", deck: d })
  assert.deepEqual(resolveSelectedDeck([d], "99/1"), { status: "missing" })
})

test("matchRows finds opponents by id, then by name, and scores results", () => {
  const joan = deck({ id: 2, player: "Joan", archetype: "control" })
  const stevie = deck({ id: 3, player: "Stevie" })
  const ozzy = deck({
    id: 1,
    player: "Ozzy",
    matches: [
      { round: 2, opponent: "stevie", wins: 1, losses: 1, draws: 0 },
      { round: 1, opponent: "Joan", opponent_id: 2, wins: 2, losses: 1, draws: 0 },
    ],
  })

  const rows = matchRows(ozzy, [ozzy, joan, stevie])

  assert.equal(rows[0].round, 1)
  assert.equal(rows[0].opponentRef, "48/2")
  assert.equal(rows[0].opponentArchetype, "Control")
  assert.equal(rows[0].result, "W")
  assert.equal(rows[0].score, "2-1")

  assert.equal(rows[1].opponentRef, "48/3")
  assert.equal(rows[1].result, "D")
})

test("matchRows leaves an opponent outside the list unlinked", () => {
  const ozzy = deck({ matches: [{ round: 1, opponent: "Freddie", wins: 0, losses: 2, draws: 0 }] })
  const rows = matchRows(ozzy, [ozzy])
  assert.equal(rows[0].opponentRef, null)
  assert.equal(rows[0].result, "L")
})

test("leansInto skips manabase and small groups", () => {
  const cards = ["A", "B", "C", "D", "E"].map(name => ({ name }))
  const dist = {
    deck_count: 10,
    groups: [
      { name: "Prowess", cards: ["A", "B", "C"], deck_counts: [0, 0, 0, 0, 0, 0, 0, 0, 1, 3] },
      { name: "Fixing", manabase: true, cards: ["A", "B", "C"], deck_counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { name: "Tokens", cards: ["D", "E"], deck_counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ],
  }
  assert.deepEqual(leansInto(dist, cards), [{ name: "Prowess", count: 3, topPercent: 10 }])
})

test("copyListText writes one line per card name with its count", () => {
  const cards = [{ name: "Lightning Bolt" }, { name: "Opt" }, { name: "Lightning Bolt" }]
  assert.equal(copyListText(cards), "2x Lightning Bolt\n1x Opt\n")
})
