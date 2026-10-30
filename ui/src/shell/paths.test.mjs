import { test } from "node:test"
import assert from "node:assert/strict"
import { cardPageHref, deckHrefWithMatch, pageSegment, pageHref, pageHrefWithMatch, switchCubeInPath } from "./paths.js"

test("the page segment is the part after the cube id", () => {
  assert.equal(pageSegment("/polyverse/cards"), "cards")
  assert.equal(pageSegment("/polyverse/import/photos"), "import")
})

test("a cube's home has an empty page segment", () => {
  assert.equal(pageSegment("/polyverse"), "")
  assert.equal(pageSegment("/"), "")
})

test("page links point at the cube home for an empty path", () => {
  assert.equal(pageHref("cc:joan", ""), "/cc:joan")
  assert.equal(pageHref("cc:joan", "decks"), "/cc:joan/decks")
})

test("switching cubes keeps the rest of the path", () => {
  assert.equal(switchCubeInPath("/polyverse/cards", "aurora"), "/aurora/cards")
  assert.equal(switchCubeInPath("/polyverse/import/photos", "aurora"), "/aurora/import/photos")
  assert.equal(switchCubeInPath("/", "aurora"), "/aurora")
})

test("pageHrefWithMatch encodes the player term", () => {
  const href = pageHrefWithMatch("polyverse", "cards", 'player:"Joan Jett"', "", "")
  assert.equal(href, "/polyverse/cards?match=" + encodeURIComponent('player:"Joan Jett"'))
  const query = new URLSearchParams(href.split("?")[1])
  assert.equal(query.get("match"), 'player:"Joan Jett"')
  assert.equal(query.has("start"), false)
  assert.equal(query.has("end"), false)
})

test("pageHrefWithMatch keeps the date range when set", () => {
  const href = pageHrefWithMatch("polyverse", "decks", 'player:"Ozzy"', "2025-01-01", "2025-12-31")
  const query = new URLSearchParams(href.split("?")[1])
  assert.equal(query.get("start"), "2025-01-01")
  assert.equal(query.get("end"), "2025-12-31")
})

test("cardPageHref encodes the name", () => {
  assert.equal(cardPageHref("polyverse", "Fire // Ice"), "/polyverse/cards/Fire%20%2F%2F%20Ice")
})

test("cardPageHref round-trips split card names", () => {
  for (const name of ["Fire // Ice", "Kellan, the Fae-Blooded // Birthright Boon", "Ashnod's Altar"]) {
    const href = cardPageHref("polyverse", name)
    const parts = href.split("/")
    assert.equal(parts.length, 4)
    assert.equal(decodeURIComponent(parts[3]), name)
  }
})

test("deckHrefWithMatch sets deck and match", () => {
  const href = deckHrefWithMatch("polyverse", "31/5", 'card:"Goblin Bombardment"', "2025-01-01", "")
  assert.equal(href, "/polyverse/decks?match=card%3A%22Goblin%20Bombardment%22&start=2025-01-01&deck=31%2F5")
})
