import { test } from "node:test"
import assert from "node:assert/strict"
import { connectionLine, joinOpacity, joinText, linkedCount, partnerText, readParams, splitJoins, typeText, writeParams } from "./explorerModel.js"

test("the URL's search, switches and thin cutoff read with defaults", () => {
  const fills = { key: "fills", dir: "desc" }
  assert.deepEqual(readParams(new URLSearchParams("")), { q: "", maybe: false, thin: 10, all: false, sort: fills })
  assert.deepEqual(readParams(new URLSearchParams("q=c%3AG&maybe=1&thin=4&all=1")), { q: "c:G", maybe: true, thin: 4, all: true, sort: fills })
  assert.equal(readParams(new URLSearchParams("thin=abc")).thin, 10)
})

test("writing params drops defaults and keeps the rest", () => {
  const next = writeParams(new URLSearchParams("q=x&view=keep"), { maybe: true, thin: 10, all: false })
  assert.equal(next.toString(), "q=x&view=keep&maybe=1")
  assert.equal(writeParams(next, { q: "", maybe: false }).toString(), "view=keep")
  assert.equal(writeParams(next, { q: "   " }).toString(), "view=keep&maybe=1")
  assert.equal(writeParams(next, { q: " c:G " }).toString(), "q=c%3AG&view=keep&maybe=1")
})

const join = { package: "Sacrifice", wire: 2, role: "payoff", via: ["Outlets"], others: 8, partner: ["Makers", "card:Lone Payoff"], partner_cards: 12, partner_basics: false }

test("a join reads as the package, the role and how many others share it", () => {
  assert.equal(joinText(join), "Sacrifice · payoff (8 others)")
  assert.equal(joinText({ ...join, role: "pairs", package: "Control", others: 1 }), "Control · pairs (1 other)")
})

test("a join's tip names what it pairs with", () => {
  assert.equal(partnerText(join), "with 12 enablers: Makers, Lone Payoff")
  assert.equal(partnerText({ ...join, role: "enabler", partner_cards: 1 }), "with 1 payoff: Makers, Lone Payoff")
  assert.equal(partnerText({ ...join, role: "pairs", partner_cards: 0, partner_basics: true, partner: ["Basic lands"] }), "pairs with basic lands: Basic lands")
  assert.equal(partnerText({ ...join, partner_basics: true }), "with 12 enablers and basic lands: Makers, Lone Payoff")
})

test("a join fades as its role gets crowded", () => {
  assert.equal(joinOpacity(0), 1)
  assert.ok(joinOpacity(4) < 1 && joinOpacity(4) > joinOpacity(40))
  assert.ok(joinOpacity(1000) >= 0.35)
})

const card = {
  name: "Turntimber Sower", cmc: 3, fills_gaps: 0.83,
  groups: [{ name: "A" }, { name: "B" }],
  joins: [{ package: "Lands" }, { package: "Sacrifice" }, { package: "Sacrifice" }],
  linked: ["x", "y"], linked_basics: true,
  connections: [{ a: "Lands", b: "Sacrifice", shared: 9 }],
}

test("the sort goes in the URL unless it's the default", () => {
  const named = writeParams(new URLSearchParams("q=x"), { sort: { key: "name", dir: "asc" } })
  assert.equal(named.toString(), "q=x&sort=name&dir=asc")
  assert.deepEqual(readParams(named).sort, { key: "name", dir: "asc" })
  assert.equal(writeParams(named, { sort: { key: "fills", dir: "desc" } }).toString(), "q=x")
})

test("linked counts basic lands as one more", () => {
  assert.equal(linkedCount(card), 3)
  assert.equal(linkedCount({ ...card, linked_basics: false }), 2)
  assert.equal(linkedCount({ linked: [], linked_basics: true }), 1)
})

test("a connection reads as the two packages and what they share", () => {
  assert.equal(connectionLine({ a: "Lands", b: "Sacrifice", shared: 0 }), "Lands and Sacrifice share no other cards")
  assert.equal(connectionLine({ a: "Lands", b: "Ramp", shared: 1 }), "Lands and Ramp share 1 other card")
  assert.equal(connectionLine({ a: "Lands", b: "Ramp", shared: 9 }), "Lands and Ramp share 9 other cards")
})

test("thin joins come first, thinnest first, and crowded ones are set aside", () => {
  const joins = [{ package: "A", others: 40 }, { package: "B", others: 8 }, { package: "C", others: 2 }, { package: "D", others: 10 }]
  const { thin, crowded } = splitJoins(joins, 10)
  assert.deepEqual(thin.map(j => j.package), ["C", "B", "D"])
  assert.deepEqual(crowded.map(j => j.package), ["A"])
})

test("the type line carries power and toughness when the card has them", () => {
  assert.equal(typeText({ type_line: "Creature — Elf Druid", power: "3", toughness: "3" }), "Creature — Elf Druid · 3/3")
  assert.equal(typeText({ type_line: "Instant", power: "", toughness: "" }), "Instant")
})
