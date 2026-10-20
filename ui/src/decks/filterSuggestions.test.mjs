import { test } from "node:test"
import assert from "node:assert/strict"
import { filterSuggestions } from "./filterSuggestions.js"

test("lists named players, archetypes with tags, and event codes", () => {
  const decks = [
    { player: "Ozzy", player_id: 1, macro_archetype: "aggro", labels: ["spells"], draft: { event_code: "GP" } },
    { player: "Freddie", player_id: 2, macro_archetype: "control" },
    { player: "p3", seat: 3 },
  ]
  assert.deepEqual(filterSuggestions(decks), {
    playerNames: ["Freddie", "Ozzy"],
    archetypes: ["aggro", "control", "spells"],
    eventCodes: ["GP"],
  })
})

test("no decks give empty lists", () => {
  assert.deepEqual(filterSuggestions([]), { playerNames: [], archetypes: [], eventCodes: [] })
})
