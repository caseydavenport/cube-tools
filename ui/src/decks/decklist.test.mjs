import { test } from "node:test"
import assert from "node:assert/strict"
import { decklistColumns } from "./decklist.js"

// card builds the fields the decklist columns read.
function card(name, cmc, types, oracleText = "") {
  return { name, cmc, types, oracle_text: oracleText }
}

// column finds a column by its key.
function column(columns, key) {
  return columns.find(c => c.key === key)
}

test("0 and 1 mana cards share the first column", () => {
  const columns = decklistColumns([card("Ornithopter", 0, ["Artifact", "Creature"]), card("Opt", 1, ["Instant"])])
  const first = column(columns, "0-1")
  assert.equal(first.label, "0-1")
  assert.equal(first.count, 2)
})

test("6 mana cards go in the 5+ column", () => {
  const columns = decklistColumns([card("Griselbrand", 8, ["Creature"])])
  assert.equal(column(columns, "5+").count, 1)
})

test("lands get their own column grouped by role", () => {
  const columns = decklistColumns([
    card("Forest", 0, ["Basic", "Land"]),
    card("Misty Rainforest", 0, ["Land"], "{T}, Pay 1 life, Sacrifice this land: Search your library for a Forest or Island card"),
  ])
  const lands = column(columns, "lands")

  assert.equal(column(columns, "0-1"), undefined)
  assert.deepEqual(lands.groups.map(g => g.type), ["Basics", "Fetches"])
})

test("columns group cards by type and collapse duplicates", () => {
  const columns = decklistColumns([
    card("Lightning Bolt", 1, ["Instant"]),
    card("Lightning Bolt", 1, ["Instant"]),
    card("Goblin Guide", 1, ["Creature"]),
  ])
  const first = column(columns, "0-1")

  assert.equal(first.count, 3)
  assert.deepEqual(first.groups.map(g => g.type), ["Creature", "Instant"])
  assert.equal(first.groups[1].cards[0].copies, 2)
})

test("empty columns are left out", () => {
  const columns = decklistColumns([card("Opt", 1, ["Instant"])])
  assert.deepEqual(columns.map(c => c.key), ["0-1"])
})
