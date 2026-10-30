import { test } from "node:test"
import assert from "node:assert/strict"
import { cardSubtitle, historyTitle, playedTile, popularityLabel, popularityTip } from "./cardPageModel.js"

const bombardment = { mainboard: 20, available: 314, rate: 6.4, popularity: "niche", peers: "R", peer_median: 9.1 }

test("the played tile counts decks out of those that could", () => {
  assert.deepEqual(playedTile(bombardment), { value: "20 of 314", detail: "6% of decks that could" })
  assert.deepEqual(playedTile({ mainboard: 0, available: 0, rate: 0 }), { value: "0 of 0", detail: "" })
})

test("the popularity tip compares with the card's color", () => {
  assert.equal(popularityTip(bombardment), "Mainboarded in 6.4% of the decks that could have. The median red card: 9.1%.")
  assert.equal(popularityTip({ ...bombardment, peers: "M" }), "Mainboarded in 6.4% of the decks that could have. The median multicolor card: 9.1%.")
  assert.equal(popularityTip({ ...bombardment, popularity: "" }), "")
})

test("popularity labels are capitalized words", () => {
  assert.equal(popularityLabel("popular"), "Popular")
  assert.equal(popularityLabel("niche"), "Niche")
  assert.equal(popularityLabel(""), "")
})

test("history squares say the draft, date and state", () => {
  assert.equal(historyTitle({ draft_id: 31, date: "2025-08-31", state: "played" }), "Draft 31, 2025-08-31: played")
  assert.equal(historyTitle({ draft_id: 2, date: "2023-04-19", state: "unknown" }), "Draft 2, 2023-04-19: no cube list")
  assert.equal(historyTitle({ draft_id: 9, date: "2023-07-23", state: "out" }), "Draft 9, 2023-07-23: not in the cube")
})

test("the subtitle is the mana cost and types", () => {
  assert.equal(cardSubtitle({ mana_cost: "{1}{R}", types: ["Enchantment"] }), "{1}{R} · Enchantment")
  assert.equal(cardSubtitle({ mana_cost: "", types: ["Land"] }), "Land")
})
