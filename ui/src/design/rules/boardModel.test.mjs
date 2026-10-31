import { test } from "node:test"
import assert from "node:assert/strict"
import { badges, colorShares, dotKeys, entryLabel, filterBoard, linkPair, sortPackages, wiringSummary } from "./boardModel.js"

// group builds a board group with count placeholder cards, or the named ones.
function group(name, cards) {
  if (typeof cards === "number") {
    cards = Array.from({ length: cards }, (_, i) => `Filler ${i}`)
  }
  return { name, cards }
}

// pkg builds a board package from its wires and groups.
function pkg(name, wires, groups, extra = {}) {
  return {
    name,
    wires,
    groups,
    stat: { buildRate: 0, rarelyTogether: false },
    shares_with: [],
    one_card_groups: [],
    colors: {},
    ...extra,
  }
}

const delirium = pkg(
  "Delirium",
  [{ sources: ["Delirium"], targets: ["Types in graveyard", "Sacs artifacts"] }],
  [group("Delirium", 9), group("Types in graveyard", ["Arid Mesa", "Urza's Saga"]), group("Sacs artifacts", 3)],
  { stat: { buildRate: 0.14, rarelyTogether: false } },
)
const burn = pkg(
  "Burn",
  [{ sources: ["Fodder"], targets: ["card:Lightning Bolt"] }],
  [group("Fodder", ["Grim Lavamancer"]), group("card:Lightning Bolt", ["Lightning Bolt"])],
  { stat: { buildRate: 0.3, rarelyTogether: false } },
)
const lands = pkg(
  "Lands",
  [{ sources: ["A", "B"], targets: ["C"] }, { sources: ["A"], targets: ["D", "E"] }],
  [group("A", 1), group("B", 1), group("C", 1), group("D", 1), group("E", 1)],
  { stat: { buildRate: 0.3, rarelyTogether: false } },
)

test("one wire reads as its two sides with card counts", () => {
  const groups = [group("Delirium", 9), group("Types in graveyard", 55), group("Sacs artifacts", 3)]
  const p = pkg("Delirium", delirium.wires, groups)
  assert.equal(wiringSummary(p), "Delirium (9) ↔ Types in graveyard (55), Sacs artifacts (3)")
})

test("a card entry reads as the bare card name", () => {
  assert.equal(wiringSummary(burn), "Fodder (1) ↔ Lightning Bolt")
})

test("several wires read as wire and group counts", () => {
  assert.equal(wiringSummary(lands), "2 wires · 5 groups")
})

test("badges list the problem, one-card groups, rarely together, then sharing", () => {
  const p = pkg("X", [], [], {
    one_card_groups: ["A"],
    stat: { buildRate: 0, rarelyTogether: true },
    shares_with: ["Creature Value", "Delirium", "Sacrifice"],
  })
  assert.deepEqual(badges(p, "Missing: Ghost"), [
    { kind: "bad", text: "Missing: Ghost" },
    { kind: "warn", text: "1-card group" },
    { kind: "warn", text: "Rarely comes together" },
    { kind: "info", text: "Shares groups with Creature Value, Delirium +1" },
  ])
})

test("two one-card groups are counted in one badge", () => {
  const p = pkg("X", [], [], { one_card_groups: ["A", "B"] })
  assert.deepEqual(badges(p, null), [{ kind: "warn", text: "2 one-card groups" }])
})

test("a package with nothing to flag has no badges", () => {
  assert.deepEqual(badges(pkg("X", [], []), null), [])
})

test("packages sort by name or by how often they're built", () => {
  assert.deepEqual(sortPackages([lands, delirium, burn], "az").map(p => p.name), ["Burn", "Delirium", "Lands"])
  assert.deepEqual(sortPackages([lands, delirium, burn], "built").map(p => p.name), ["Burn", "Lands", "Delirium"])
})

const board = { packages: [delirium, burn, lands], unused_groups: [group("Spare", ["Counterspell"])] }

test("an empty search shows everything", () => {
  const out = filterBoard(board, "  ")
  assert.deepEqual(out.packages.map(p => [p.pkg.name, p.index, p.hits]), [["Delirium", 0, []], ["Burn", 1, []], ["Lands", 2, []]])
  assert.deepEqual(out.unused.map(g => g.name), ["Spare"])
})

test("a card search shows the packages holding it and where", () => {
  const out = filterBoard(board, " ARID ")
  assert.deepEqual(out.packages.map(p => [p.pkg.name, p.hits]), [["Delirium", [{ card: "Arid Mesa", group: "Types in graveyard" }]]])
  assert.deepEqual(out.unused, [])
})

test("a package or group name search shows the package without hits", () => {
  assert.deepEqual(filterBoard(board, "burn").packages.map(p => [p.pkg.name, p.hits]), [["Burn", []]])
  assert.deepEqual(filterBoard(board, "sacs art").packages.map(p => [p.pkg.name, p.hits]), [["Delirium", []]])
  assert.deepEqual(filterBoard(board, "spare").unused.map(g => g.name), ["Spare"])
})

const names = ["Goblin Bombardment", "Mayhem Devil"]

test("two card names joined by × or x make a link check pair", () => {
  assert.deepEqual(linkPair("goblin bombardment × mayhem devil", names), { a: "Goblin Bombardment", b: "Mayhem Devil" })
  assert.deepEqual(linkPair("Goblin Bombardment x Mayhem Devil", names), { a: "Goblin Bombardment", b: "Mayhem Devil" })
})

test("an unknown card or a single card makes no pair", () => {
  assert.equal(linkPair("goblin bombardment × nobody", names), null)
  assert.equal(linkPair("goblin bombardment", names), null)
})

test("color shares keep nonzero columns in table order", () => {
  assert.deepEqual(colorShares({ W: 1, U: 0, B: 1, R: 2, G: 0, C: 0, L: 0 }), [
    { key: "W", pct: 25 },
    { key: "B", pct: 25 },
    { key: "R", pct: 50 },
  ])
  assert.deepEqual(colorShares({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, L: 0 }), [])
})

test("a card's dots are its colors, or land, or colorless", () => {
  assert.deepEqual(dotKeys({ colors: [], land: true }), ["L"])
  assert.deepEqual(dotKeys({ colors: [], land: false }), ["C"])
  assert.deepEqual(dotKeys({ colors: ["B", "G"], land: false }), ["B", "G"])
})

test("a card entry is labeled with its card", () => {
  assert.equal(entryLabel("card:Lightning Bolt"), "Lightning Bolt")
  assert.equal(entryLabel("Fodder"), "Fodder")
})
