import { test } from "node:test"
import assert from "node:assert/strict"
import { bothCardsMatch, cardSubtitle, compareLoom, deckRecord, draftsTile, historyTitle, isNewToCube, notInCubeTag, partnerMapData, pickLine, playedTile, popularityLabel, popularityTip, whoPlaysMatch } from "./cardPageModel.js"
import { ruleColor } from "../design/map/ruleColors.js"

const bombardment = { drafts_played: 18, drafts_available: 37, rate: 48.6, popularity: "niche", peers: "R", peer_median: 52.1 }

test("the played tile counts drafts out of those the card was in", () => {
  assert.deepEqual(playedTile(bombardment), { value: "18 of 37", detail: "49% of the drafts it was in" })
  assert.deepEqual(playedTile({ drafts_played: 0, drafts_available: 0, rate: 0 }), { value: "0 of 0", detail: "" })
})

test("the popularity tip compares with the card's color", () => {
  assert.equal(popularityTip(bombardment), "Played in 48.6% of the drafts it was in. The median red card: 52.1%.")
  assert.equal(popularityTip({ ...bombardment, peers: "M" }), "Played in 48.6% of the drafts it was in. The median multicolor card: 52.1%.")
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

test("who-plays links filter to the card plus one trait", () => {
  assert.equal(whoPlaysMatch("Goblin Bombardment", "colors", "WBR"), 'card:"Goblin Bombardment" dcolor=WBR')
  assert.equal(whoPlaysMatch("Goblin Bombardment", "archetype", "aggro"), 'card:"Goblin Bombardment" arch:aggro')
  assert.equal(whoPlaysMatch("Goblin Bombardment", "player", "Ozzy Osbourne"), 'card:"Goblin Bombardment" player:"Ozzy Osbourne"')
})

test("a pick reads as date, player, pack and pick", () => {
  assert.equal(pickLine({ date: "2025-08-31", player: "Freddie", pack: 1, pick: 5 }), "2025-08-31 · Freddie · pack 1, pick 5")
})

test("a deck's record shows draws only when there are some", () => {
  assert.equal(deckRecord({ wins: 2, losses: 1, draws: 0 }), "2-1")
  assert.equal(deckRecord({ wins: 1, losses: 1, draws: 1 }), "1-1-1")
})

// historyOf builds a history list from a string of state initials.
function historyOf(states) {
  const names = { p: "played", i: "in", o: "out", u: "unknown" }
  return [...states].map((c, i) => ({ draft_id: i + 1, state: names[c] }))
}

test("the drafts tile counts only drafts with a cube list", () => {
  assert.deepEqual(draftsTile(historyOf("uupio")), { value: "2 of 3", detail: "2 drafts have no cube list" })
  assert.deepEqual(draftsTile(historyOf("pio")), { value: "2 of 3", detail: "" })
  assert.equal(draftsTile(historyOf("uu")), null)
})

test("a card is new only when the cube lists say so", () => {
  assert.equal(isNewToCube(historyOf("ppio")), true)
  assert.equal(isNewToCube(historyOf("pppppo")), false)
  assert.equal(isNewToCube(historyOf("uu")), false)
})

test("a card out of the cube is cut only when its history shows it in", () => {
  assert.equal(notInCubeTag(historyOf("ppio")), "Cut from the cube")
  assert.equal(notInCubeTag(historyOf("uuoo")), "Not in the cube")
  assert.equal(notInCubeTag([]), "Not in the cube")
})
