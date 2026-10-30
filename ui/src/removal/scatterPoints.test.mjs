import { test } from "node:test"
import assert from "node:assert/strict"
import { colorGroup, scatterSeries, scatterX } from "./scatterPoints.js"

test("colorGroup names a card's color, multicolor, or colorless", () => {
  assert.equal(colorGroup([]), "colorless")
  assert.equal(colorGroup(undefined), "colorless")
  assert.equal(colorGroup(["R"]), "R")
  assert.equal(colorGroup(["W", "B"]), "multi")
})

test("scatterX spreads cards at one cost deterministically", () => {
  const bolt = scatterX({ name: "Lightning Bolt", eff_cost: 2 })
  const path = scatterX({ name: "Path to Exile", eff_cost: 2 })
  assert.notEqual(bolt, path)
  for (const x of [bolt, path]) {
    assert.ok(x >= 1.7 && x <= 2.3, `${x} is within 0.3 of the cost`)
  }
  assert.equal(scatterX({ name: "Lightning Bolt", eff_cost: 2 }), bolt)
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
