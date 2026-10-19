import { test } from "node:test"
import assert from "node:assert/strict"
import {
  countSummary, bestArchetype, bestColorPair, colorWinRates, hottestCard, topPlayers,
} from "./homeStats.js"

// deck builds the few deck fields countSummary reads.
function deck(draftId, player) {
  return { metadata: { draft_id: draftId }, player }
}

test("countSummary counts drafts, decks, and the people the labeler names", () => {
  const decks = [deck(1, "Ozzy"), deck(1, "Joan"), deck(2, "Ozzy")]
  assert.deepEqual(countSummary(decks, d => d.player), { drafts: 2, decks: 3, players: 2 })
})

test("countSummary of no decks is all zeros", () => {
  assert.deepEqual(countSummary([], d => d.player), { drafts: 0, decks: 0, players: 0 })
})

// archetypes builds a /stats/archetypes response.
function archetypes(entries) {
  return { archetypes: entries }
}

test("bestArchetype picks the best macro archetype and ignores tags", () => {
  const response = archetypes({
    aggro: { count: 65, build_percent: 24.2, win_percent: 51.8, wins: 210, losses: 195 },
    midrange: { count: 137, build_percent: 50.9, win_percent: 48.6, wins: 400, losses: 420 },
    control: { count: 67, build_percent: 24.9, win_percent: 51.3, wins: 200, losses: 190 },
    spells: { count: 43, build_percent: 16, win_percent: 70, wins: 70, losses: 30 },
  })
  assert.deepEqual(bestArchetype(response), { name: "aggro", winPercent: 51.8, buildPercent: 24.2 })
})

test("bestArchetype is null when no deck has an archetype", () => {
  const empty = { count: 0, build_percent: 0, win_percent: 0, wins: 0, losses: 0 }
  assert.equal(bestArchetype(archetypes({ aggro: empty, midrange: empty, control: empty })), null)
  assert.equal(bestArchetype(undefined), null)
})

// colors builds a /stats/colors response.
function colors(entries) {
  return { all: { data: entries } }
}

test("bestColorPair considers only two-color pairs with enough decks", () => {
  const response = colors({
    B: { color: "B", win_percent: 60, num_decks: 143 },
    WBR: { color: "WBR", win_percent: 70, num_decks: 30 },
    WB: { color: "WB", win_percent: 56.7, num_decks: 69 },
    UB: { color: "UB", win_percent: 55.8, num_decks: 56 },
    RG: { color: "RG", win_percent: 80, num_decks: 4 },
  })
  assert.deepEqual(bestColorPair(response), { identity: "WB", name: "Orzhov", winPercent: 56.7, decks: 69 })
})

test("bestColorPair is null with no qualifying pairs", () => {
  assert.equal(bestColorPair(colors({})), null)
  assert.equal(bestColorPair(undefined), null)
})

test("colorWinRates lists single colors in WUBRG order and skips unplayed ones", () => {
  const response = colors({
    G: { color: "G", win_percent: 48.5, num_decks: 130 },
    W: { color: "W", win_percent: 51.6, num_decks: 141 },
    U: { color: "U", win_percent: 0, num_decks: 0 },
    WB: { color: "WB", win_percent: 56.7, num_decks: 69 },
  })
  assert.deepEqual(colorWinRates(response), [
    { color: "W", winPercent: 51.6, decks: 141 },
    { color: "G", winPercent: 48.5, decks: 130 },
  ])
  assert.deepEqual(colorWinRates(undefined), [])
})

test("hottestCard picks the largest gain over expected, skipping cards with no expectation", () => {
  const response = {
    all: {
      data: {
        "Toxic Deluge": { name: "Toxic Deluge", win_percent: 67.9, expected_win_percent: 47 },
        "Audacity": { name: "Audacity", win_percent: 65.1, expected_win_percent: 45.5 },
        "Brand New": { name: "Brand New", win_percent: 100, expected_win_percent: 0 },
      },
    },
  }
  assert.deepEqual(hottestCard(response), { name: "Toxic Deluge", delta: 21, winPercent: 67.9 })
})

test("hottestCard is null with no cards", () => {
  assert.equal(hottestCard({ all: { data: {} } }), null)
  assert.equal(hottestCard(undefined), null)
})

test("topPlayers keeps players with enough decks, best first, capped", () => {
  const response = {
    players: {
      Freddie: { id: 1, name: "Freddie", num_decks: 4, win_percent: 90 },
      Greg: { id: 5, name: "Greg", num_decks: 7, win_percent: 64.4 },
      Xander: { id: 4, name: "Xander", num_decks: 12, win_percent: 60.8 },
      Joan: { id: 6, name: "Joan", num_decks: 9, win_percent: 60.8 },
      Ozzy: { id: 7, name: "Ozzy", num_decks: 20, win_percent: 40 },
    },
  }
  assert.deepEqual(topPlayers(response), [
    { id: 5, name: "Greg", decks: 7, winPercent: 64.4 },
    { id: 4, name: "Xander", decks: 12, winPercent: 60.8 },
    { id: 6, name: "Joan", decks: 9, winPercent: 60.8 },
  ])
  assert.deepEqual(topPlayers(undefined), [])
})
