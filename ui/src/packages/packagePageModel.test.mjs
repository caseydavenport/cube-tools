import { test } from "node:test"
import assert from "node:assert/strict"
import { chartSeries, colorCell, headerTiles, packageSubtitle } from "./packagePageModel.js"

const wires = [
  { sources: [{ name: "Graveyard" }], targets: [{ name: "Delirium payoffs" }, { name: "Reanimate targets" }] },
  { sources: [{ name: "Graveyard" }], targets: [{ name: "Flashback" }] },
]

test("the subtitle counts distinct groups and the package's cards", () => {
  assert.equal(packageSubtitle({ wires, stat: { cardCount: 61 } }), "4 groups · 61 cards")
  assert.equal(packageSubtitle({ wires: [{ sources: [{ name: "A" }], targets: [] }], stat: { cardCount: 1 } }), "1 group · 1 card")
})

test("the header tiles read in words", () => {
  const tiles = headerTiles({ package: 111, buildRate: 0.449, has3: 166, cameTogether: 0.669 })
  assert.deepEqual(tiles.map(t => [t.key, t.label, t.value, t.detail]), [
    ["built", "Built in", "111 decks", "45% of decks"],
    ["had", "Had the cards", "166 decks", "3 or more of its cards"],
    ["together", "Came together", "67%", "of the decks with its cards"],
  ])
})

test("a color cell is thin only when the server says so", () => {
  const row = { counts: { W: 0, B: 1, R: 5 }, thin: ["B"] }
  assert.deepEqual(colorCell(row, "B"), { value: 1, thin: true })
  assert.deepEqual(colorCell(row, "W"), { value: 0, thin: false })
  assert.deepEqual(colorCell(row, "R"), { value: 5, thin: false })
})

test("the chart keeps every draft and gives each draft's raw rate", () => {
  const overTime = [
    { draft_id: 1, date: "2024-01-01", built: 1, decks: 4, smoothed: 25, in_range: false },
    { draft_id: 2, date: "2024-02-01", built: 0, decks: 0, smoothed: 25, in_range: true },
    { draft_id: 3, date: "2024-03-01", built: 3, decks: 6, smoothed: 40, in_range: true },
  ]
  assert.deepEqual(chartSeries(overTime), {
    labels: ["2024-01-01", "2024-02-01", "2024-03-01"],
    smoothed: [25, 25, 40],
    raw: [25, null, 50],
    inRange: [false, true, true],
  })
})
