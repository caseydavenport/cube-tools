import { test } from "node:test"
import assert from "node:assert/strict"
import { pivotMeta } from "./pivotMeta.js"

test("ranks players by deck count, then name", () => {
  const decks = [
    { player: "Stevie", player_id: 3 },
    { player: "Ozzy", player_id: 1 },
    { player: "Freddie", player_id: 2 },
    { player: "Ozzy", player_id: 1 },
    { player: "p4", seat: 4 },
  ]
  const meta = pivotMeta(decks)
  assert.deepEqual(meta.playerFreq, [
    { name: "Ozzy", count: 2 },
    { name: "Freddie", count: 1 },
    { name: "Stevie", count: 1 },
  ])
  assert.deepEqual(meta.players, ["Freddie", "Ozzy", "Stevie"])
})

test("collects sorted archetypes and tags", () => {
  const decks = [
    { player: "Ozzy", player_id: 1, macro_archetype: "control", labels: ["spells"] },
    { player: "Ozzy", player_id: 1, macro_archetype: "aggro", labels: ["burn"] },
    { player: "Ozzy", player_id: 1, macro_archetype: "aggro" },
  ]
  const meta = pivotMeta(decks)
  assert.deepEqual(meta.archetypes, ["aggro", "control"])
  assert.deepEqual(meta.labels, ["burn", "spells"])
})
