import { test } from "node:test"
import assert from "node:assert/strict"
import { colorGroup, hardToRemoveRows, scatterSeries } from "./scatterPoints.js"

test("colorGroup names a card's color, multicolor, or colorless", () => {
  assert.equal(colorGroup([]), "colorless")
  assert.equal(colorGroup(undefined), "colorless")
  assert.equal(colorGroup(["R"]), "R")
  assert.equal(colorGroup(["W", "B"]), "multi")
})

test("scatterSeries spreads cards that would overlap evenly, in name order", () => {
  const cards = [
    { name: "Seal of Fire", colors: ["R"], eff_cost: 1, pct_cube: 73.4 },
    { name: "Unholy Heat", colors: ["R"], eff_cost: 1, pct_cube: 72.9 },
    { name: "Barbarian Ring", colors: [], eff_cost: 1, pct_cube: 73.4 },
    { name: "Murder", colors: ["B"], eff_cost: 1, pct_cube: 100 },
  ]
  const xs = {}
  for (const series of scatterSeries(cards, "raw")) {
    for (const point of series.points) {
      xs[point.name] = point.x
    }
  }
  assert.deepEqual(
    [xs["Barbarian Ring"], xs["Seal of Fire"], xs["Unholy Heat"]].map(x => Math.round(x * 100) / 100),
    [0.7, 1, 1.3],
    "three near-equal points share the cost evenly, sorted by name",
  )
  assert.equal(xs["Murder"], 1, "a point alone at its height stays on its cost")
})

test("scatterSeries lists points in name order, so a re-sorted table doesn't shuffle them", () => {
  const cards = [
    { name: "Shock", colors: ["R"], eff_cost: 1, pct_cube: 40 },
    { name: "Bolt", colors: ["R"], eff_cost: 1, pct_cube: 90 },
  ]
  assert.deepEqual(scatterSeries(cards, "raw")[0].points.map(p => p.name), ["Bolt", "Shock"])
})

test("scatterSeries groups by color in a fixed order, skipping scalable cards", () => {
  const cards = [
    { name: "Murder", colors: ["B"], eff_cost: 3, pct_cube: 100, pct_played: 99, restriction: "any creature" },
    { name: "Shock", colors: ["R"], eff_cost: 1, pct_cube: 40, pct_played: 45, restriction: "toughness ≤ 2" },
    { name: "Fireball", colors: ["R"], eff_cost: 4, scalable: true },
    { name: "Bomb", colors: [], eff_cost: 2, pct_cube: 60, pct_played: 61, restriction: "mana value ≤ 2" },
  ]
  const raw = scatterSeries(cards, "raw")
  assert.deepEqual(raw.map(s => s.group), ["B", "R", "colorless"])
  assert.equal(raw[1].points.length, 1, "Fireball is left out")
  assert.equal(raw[0].points[0].y, 100)
  assert.equal(raw[0].points[0].name, "Murder")

  const played = scatterSeries(cards, "played")
  assert.equal(played[0].points[0].y, 99)
})

test("hardToRemoveRows sorts by the chosen color's answers, then mana value, then name", () => {
  const creatures = [
    { name: "Bear", mv: 2, answers: { "": 2, R: 2 } },
    { name: "Titan", mv: 6, answers: { "": 5, R: 1 } },
    { name: "Giant", mv: 6, answers: { "": 5, R: 1 } },
  ]
  assert.deepEqual(hardToRemoveRows(creatures, "R").map(c => c.name), ["Giant", "Titan", "Bear"])
  assert.deepEqual(hardToRemoveRows(creatures, "").map(c => c.name), ["Bear", "Giant", "Titan"])
})
