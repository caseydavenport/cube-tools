import { test } from "node:test"
import assert from "node:assert/strict"
import {
  designGraphUrl,
  loadedFor,
  archetypeLabel,
  boardCards,
  deckCounts,
  copyListText,
  deckRef,
  quickFilterDecks,
  isDeckInList,
  groupByDraft,
  leansInto,
  listSummary,
  matchRows,
  opponentStrengthText,
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

test("a draft's header names its flight", () => {
  const d = deck()
  d.draft.flight = "A"
  assert.equal(groupByDraft([d])[0].label, "GOODBYE SF (A) · JUL 26")
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

test("boardCards picks the chosen board, empty when the deck lacks it", () => {
  const d = { mainboard: [{ name: "Opt" }], sideboard: null, pool: [{ name: "Opt" }, { name: "Shock" }] }
  assert.deepEqual(boardCards(d, "Mainboard"), [{ name: "Opt" }])
  assert.deepEqual(boardCards(d, "Sideboard"), [])
  assert.equal(boardCards(d, "Pool").length, 2)
})

test("deckCounts counts interaction from roles, not rules text", () => {
  const cards = [
    { name: "Goblin Guide", types: ["Creature"], oracle_text: "Haste" },
    { name: "Doom Blade", types: ["Instant"], roles: ["removal", "removal-creature"] },
    { name: "Duress", types: ["Sorcery"], roles: ["hand-disruption"] },
    { name: "Opt", types: ["Instant"], oracle_text: "Destroy target creature.", roles: ["cantrip", "draw"] },
  ]
  assert.deepEqual(deckCounts(cards), { cards: 4, creatures: 1, interaction: 2 })
})

test("opponent strength shows the percent when an opponent was rated", () => {
  assert.equal(opponentStrengthText({ opponent_win_percentage: 42, rated_opponents: 2 }), "42%")
})

test("opponent strength shows a dash when no opponent could be rated", () => {
  assert.equal(opponentStrengthText({ opponent_win_percentage: 0, rated_opponents: 0 }), "–")
})

// quickDeck builds a deck for the quick-filter tests.
function quickDeck(id, archetype, colors, player = "Freddie", playerId = 1) {
  return { id, seat: id, player, player_id: playerId, macro_archetype: archetype, colors, metadata: { draft_id: 1 } }
}

test("quickFilterDecks keeps every deck with no filters", () => {
  const decks = [quickDeck(1, "aggro", ["R"]), quickDeck(2, "control", ["U"])]
  assert.deepEqual(quickFilterDecks(decks, { archetype: "", colors: [], hideAnonymous: false }), decks)
})

test("quickFilterDecks matches archetype", () => {
  const decks = [quickDeck(1, "aggro", ["R"]), quickDeck(2, "control", ["U"])]
  assert.deepEqual(quickFilterDecks(decks, { archetype: "control", colors: [], hideAnonymous: false }).map(d => d.id), [2])
})

test("quickFilterDecks requires every chosen color", () => {
  const decks = [quickDeck(1, "aggro", ["W", "R", "G"]), quickDeck(2, "aggro", ["R"])]
  assert.deepEqual(quickFilterDecks(decks, { archetype: "", colors: ["W", "R"], hideAnonymous: false }).map(d => d.id), [1])
})

test("quickFilterDecks skips decks without colors when colors are chosen", () => {
  const decks = [quickDeck(1, "aggro", undefined), quickDeck(2, "aggro", ["R"])]
  assert.deepEqual(quickFilterDecks(decks, { archetype: "", colors: ["R"], hideAnonymous: false }).map(d => d.id), [2])
})

test("quickFilterDecks hides anonymous seats", () => {
  const decks = [quickDeck(3, "aggro", ["R"], "p3", 0), quickDeck(4, "aggro", ["R"])]
  assert.deepEqual(quickFilterDecks(decks, { archetype: "", colors: [], hideAnonymous: true }).map(d => d.id), [4])
})

test("quickFilterDecks can return nothing", () => {
  const decks = [quickDeck(1, "aggro", ["R"])]
  assert.deepEqual(quickFilterDecks(decks, { archetype: "control", colors: [], hideAnonymous: false }), [])
})

test("isDeckInList finds a deck by its ref", () => {
  const decks = [{ id: 5, metadata: { draft_id: 47 } }]
  assert.equal(isDeckInList(decks, "47/5"), true)
  assert.equal(isDeckInList(decks, "12/3"), false)
})

test("the design graph is asked for the selected deck alone", () => {
  assert.equal(designGraphUrl("polyverse", "12/3"), "/api/polyverse/stats/design-graph?deck=12%2F3")
})

test("with no deck selected the design graph covers every package", () => {
  assert.equal(designGraphUrl("polyverse", ""), "/api/polyverse/stats/design-graph")
  assert.equal(designGraphUrl("polyverse", "junk"), "/api/polyverse/stats/design-graph")
})

test("a response loaded for another url isn't shown", () => {
  const loaded = { url: "/api/polyverse/stats/design-graph?deck=12%2F3", body: { edges: [1] } }
  assert.deepEqual(loadedFor(loaded, "/api/polyverse/stats/design-graph?deck=12%2F3", {}), { edges: [1] })
  assert.deepEqual(loadedFor(loaded, "/api/polyverse/stats/design-graph?deck=48%2F1", {}), {})
})
