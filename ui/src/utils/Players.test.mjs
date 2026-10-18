import { test } from "node:test"
import assert from "node:assert/strict"
import { isAnonymous, isSeatLabel, matchPlayerByName, personLabel, playerOptions, recordsByOpponent } from "./Players.js"

test("a deck with no player id showing its seat label is anonymous", () => {
  assert.equal(isAnonymous({ id: 3, player: "p3" }), true)
  assert.equal(isAnonymous({ id: 3, player_id: 7, player: "Joan Jett" }), false)
  assert.equal(isAnonymous({ id: 3, player: "cc-user" }), false)
  assert.equal(isAnonymous({ id: 4, player: "p3" }), false)
  assert.equal(isAnonymous({ id: 4, seat: 3, player: "p3" }), true)
})

test("personLabel keeps anonymous seats in different drafts apart", () => {
  const seat = (draft) => ({ id: 3, player: "p3", metadata: { draft_id: draft } })
  assert.equal(personLabel(seat(1)), "p3 (draft 1)")
  assert.notEqual(personLabel(seat(1)), personLabel(seat(2)))
  assert.equal(personLabel({ id: 3, player_id: 7, player: "Joan Jett" }), "Joan Jett")
})

test("seat labels are p and digits", () => {
  assert.equal(isSeatLabel("p12"), true)
  assert.equal(isSeatLabel("Prince"), false)
  assert.equal(isSeatLabel(""), false)
})

test("matchPlayerByName ignores case and space, 0 on a miss", () => {
  const players = [{ id: 1, name: "Joan Jett" }, { id: 2, name: "Ozzy Osbourne" }]
  assert.equal(matchPlayerByName(players, " joan JETT "), 1)
  assert.equal(matchPlayerByName(players, "Stevie"), 0)
  assert.equal(matchPlayerByName(players, ""), 0)
})

test("playerOptions sorts by name and marks players taken elsewhere", () => {
  const players = [{ id: 2, name: "ozzy" }, { id: 1, name: "Joan" }]
  assert.deepEqual(playerOptions(players, [2]), [
    { id: 1, name: "Joan", taken: false },
    { id: 2, name: "ozzy", taken: true },
  ])
})

test("recordsByOpponent counts ties apart from wins and skips seats", () => {
  const decks = [{ games: [
    { opponent: "Ozzy", winner: "Joan" },
    { opponent: "Ozzy", winner: "Ozzy" },
    { opponent: "Ozzy", winner: "", tie: true },
    { opponent: "Ozzy", winner: "" },
    { opponent: "p3", winner: "Joan" },
  ] }]
  assert.deepEqual(recordsByOpponent(decks), [{ name: "Ozzy", wins: 1, losses: 1, ties: 2 }])
})
