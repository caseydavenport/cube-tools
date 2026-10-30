import { test } from "node:test"
import assert from "node:assert/strict"
import { bothCardsMatch, cardSubtitle, compareLoom, historyTitle, partnerMapData, playedTile, popularityLabel, popularityTip } from "./cardPageModel.js"
import { ruleColor } from "../design/map/ruleColors.js"

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

test("decks with both cards match each card exactly", () => {
  assert.equal(bothCardsMatch("Goblin Bombardment", "Mayhem Devil"), 'card:"Goblin Bombardment" card:"Mayhem Devil"')
})

test("compare links become Loom chips and labeled threads", () => {
  const links = [
    { package: "Sacrifice", group: "Sacs creatures", other_group: "Sacrifice matters" },
    { package: "Sacrifice", group: "Sacs creatures", other_group: "Dies triggers" },
  ]
  const loom = compareLoom(links, { Sacrifice: 3 })
  assert.equal(loom.left.length, 1)
  assert.equal(loom.right.length, 2)
  assert.equal(loom.threads.length, 2)
  assert.equal(loom.threads[0].label, "Sacrifice")
  assert.equal(loom.threads[0].color, ruleColor(3))
  assert.equal(loom.threads[0].from, "Sacs creatures")
  assert.equal(loom.threads[1].to, "Dies triggers")
})

test("a card: wire entry shows as the card's name", () => {
  const loom = compareLoom([{ package: "Burn", group: "card:Goblin Bombardment", other_group: "Burn spells" }], {})
  assert.equal(loom.left[0].label, "Goblin Bombardment")
  assert.equal(loom.left[0].key, "card:Goblin Bombardment")
})

test("the partner map puts each partner once around the card", () => {
  const partners = [
    { package: "Graveyard", cards: [{ name: "Mayhem Devil", colors: ["B", "R"] }] },
    { package: "Sacrifice", cards: [{ name: "Mayhem Devil", colors: ["B", "R"] }, { name: "Carrion Feeder", colors: ["B"] }] },
  ]
  const map = partnerMapData({ name: "Goblin Bombardment", colors: ["R"] }, partners, { Graveyard: 1, Sacrifice: 2 })
  assert.deepEqual(map.nodes.map(n => n.id).sort(), ["Carrion Feeder", "Goblin Bombardment", "Mayhem Devil"])
  assert.equal(map.edges.length, 2)
  const devil = map.edges.find(e => e.target === "Mayhem Devil")
  assert.equal(devil.source, "Goblin Bombardment")
  assert.equal(devil.color, ruleColor(1))
  assert.equal(devil.weight, 1)
})
